import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'

describe("Registrator contract", function () {

  const defaultLockBlocks = 10n;
  const defaultLockSize = 100n * BigInt(1e18);

  async function deploy() {
    const Token = await ethers.getContractFactory('Token')
    const Registrator = await ethers.getContractFactory('Registrator')
    const [ admin, tester, operator, receiver ] = await ethers.getSigners()

    const token = await Token.deploy(100_000_000n * BigInt(1e18))
    const tokenAddress = await token.getAddress()

    const registrator = await upgrades.deployProxy(
      Registrator,
      [ tokenAddress, operator.address, defaultLockBlocks, defaultLockSize ]
    )
    await registrator.waitForDeployment()
    const registratorAddress = await registrator.getAddress()

    return {
      Registrator,
      registrator,
      registratorAddress,
      admin,
      tester,
      operator,
      token,
      tokenAddress,
      receiver
    }
  }

  it('Deploys with a reference to provided token contract address', async () => {
    const { registrator, tokenAddress } = await loadFixture(deploy)
    expect(await registrator.tokenContract()).to.equal(tokenAddress)
  })

  it('Lock tokens for a pre-configured amount of blocks', async() => {
    const { admin, registrator, tester, token, registratorAddress } = 
      await loadFixture(deploy)

    const lockAmount = 100n * BigInt(1e18)

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, 2n * lockAmount)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    const result = await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    
    expect(await token.balanceOf(registratorAddress)).to.equal(lockAmount)
    expect(await token.balanceOf(tester.address)).to.equal(lockAmount)

    const data = await registrator.getRegistration(tester.address)
    expect(data.data[0].amount).to.equal(lockAmount)
  })
  
  it('Allows locking tokens for a specific address', async () => {
    const { admin, registrator, tester, token, registratorAddress, receiver } = 
      await loadFixture(deploy)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, 2n * lockAmount)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    const result = await registrator.connect(tester).register(receiver.address, 'some-fingerprint')
    
    expect(await token.balanceOf(registratorAddress)).to.equal(lockAmount)
    expect(await token.balanceOf(tester.address)).to.equal(lockAmount)

    const data = await registrator.getRegistration(receiver.address)
    expect(data.data[0].amount).to.equal(lockAmount)
  })

  it('Allows setting only non-zero lock lengths', async () => {
    const { registrator, operator } = await loadFixture(deploy)

    expect(await registrator.lockBlocks()).to.equal(defaultLockBlocks)
    // @ts-ignore
    await expect(registrator.connect(operator).setLockBlocks(0)).to.be.revertedWith(`Lock duration has to be non-zero`)
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 2n)
    expect(await registrator.lockBlocks()).to.equal(defaultLockBlocks * 2n)
  })

  it('Allows setting only non-zero lock size', async () => {
    const { registrator, operator } = await loadFixture(deploy)

    expect(await registrator.currentLockSize()).to.equal(defaultLockSize)
    // @ts-ignore
    await expect(registrator.connect(operator).setLockSize(0)).to.be.revertedWith(`Lock size has to be non-zero`)
    // @ts-ignore
    await registrator.connect(operator).setLockSize(defaultLockSize * 2n)
    expect(await registrator.currentLockSize()).to.equal(defaultLockSize * 2n)
  })

  it('Block unlocking tokens before unlock height', async () => {
    const { admin, registrator, tester, token, registratorAddress } = 
      await loadFixture(deploy)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, 2n * lockAmount)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    const result = await registrator.connect(tester).register(tester.address, 'some-fingerprint')

    const data = await registrator.getRegistration(tester.address)
    expect(data.data[0].amount).to.equal(lockAmount)

    // @ts-ignore
    await expect(registrator.connect(tester).unregister(tester.address, lockAmount, 'some-fingerprint')).to.be.revertedWith("No unlockables found")

  })

  it('Allows unlocking tokens starting at unlock height', async () => {
    const { admin, registrator, tester, token, registratorAddress } = 
      await loadFixture(deploy)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    const result = await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    expect(await token.balanceOf(tester.address)).to.equal(0)

    for (let i = 0; i < defaultLockBlocks; i++) {
      await network.provider.send("evm_mine")
    }
    
    // @ts-ignore
    await registrator.connect(tester).unregister(tester.address, lockAmount, 'some-fingerprint')
    expect(await token.balanceOf(tester.address)).to.equal(lockAmount)
  })

  it('Unlocks exact amount of tokens among multiple locks', async () => {
    const { admin, registrator, tester, token, registratorAddress, operator } = 
      await loadFixture(deploy)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount * 5n)
    
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 2n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 3n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 4n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 5n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')


    for (let i = 0; i < defaultLockBlocks * 3n; i++) {
      await network.provider.send("evm_mine")
    }
    
    // @ts-ignore
    await registrator.connect(tester).unregister(tester.address, lockAmount * 5n, 'some-fingerprint')

    expect(await token.balanceOf(tester.address)).to.equal(lockAmount * 3n)
    
    const data = await registrator.getRegistration(tester.address)
    
    expect(data.data[0].amount).to.equal(lockAmount)
  })

  it('Unlocks partial amount of tokens among multiple locks', async () => {
    const { admin, registrator, tester, token, registratorAddress, operator } = 
      await loadFixture(deploy)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount * 3n)
    
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 2n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    // @ts-ignore
    await registrator.connect(operator).setLockBlocks(defaultLockBlocks * 3n)
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')

    for (let i = 0; i < defaultLockBlocks * 2n; i++) {
      await network.provider.send("evm_mine")
    }
    
    // @ts-ignore
    await registrator.connect(tester).unregister(tester.address, lockAmount + (lockAmount / 2n), 'some-fingerprint')

    expect(await token.balanceOf(tester.address)).to.equal(lockAmount + (lockAmount / 2n))
    
    const data = await registrator.getRegistration(tester.address)
    
    expect(data.data[0].amount).to.equal(lockAmount / 2n)
  })

  it('Allows setting penalties per address', async () => {
    const { registrator, operator, tester } = await loadFixture(deploy)

    expect((await registrator.getRegistration(tester.address)).penalty).to.equal(0)
    // @ts-ignore
    await registrator.connect(operator).setPenalty(tester.address, 100)
    
    expect((await registrator.getRegistration(tester.address)).penalty).to.equal(100)
    // @ts-ignore
    await registrator.connect(operator).setPenalty(tester.address, 0)
    
    expect((await registrator.getRegistration(tester.address)).penalty).to.equal(0)
  })

  it('Allows locking tokens after clearing data', async () => {
    const { admin, registrator, tester, token, registratorAddress, operator } = 
      await loadFixture(deploy)

    const preData = await registrator.getRegistration(tester.address)
    expect(preData.data.length).to.equal(0)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount)
    
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    
    for (let i = 0; i < defaultLockBlocks; i++) {
      await network.provider.send("evm_mine")
    }
    
    // @ts-ignore
    await registrator.connect(tester).unregister(tester.address, lockAmount, 'some-fingerprint')

    expect(await token.balanceOf(tester.address)).to.equal(lockAmount)
    
    const postData = await registrator.getRegistration(tester.address)
    expect(postData.data.length).to.equal(0)
  })

  it('Requires fingerprint to be <= 40 characters', async () => {
    const { admin, registrator, tester, token, registratorAddress, operator } = 
      await loadFixture(deploy)

    const preData = await registrator.getRegistration(tester.address)
    expect(preData.data.length).to.equal(0)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount)
    
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await expect(registrator.connect(tester).register(tester.address, 'some-very-long-fingerprint-that-exceeds-limit')).to.be.revertedWith("Fingerprint must have 40 or less characters")
  })

  it('Filters unlocking by fingerprint', async () => {
    const { admin, registrator, tester, token, registratorAddress, operator } = 
      await loadFixture(deploy)

    const preData = await registrator.getRegistration(tester.address)
    expect(preData.data.length).to.equal(0)

    const lockAmount = defaultLockSize

    // @ts-ignore
    await token.connect(admin).transfer(tester.address, lockAmount)
    
    // @ts-ignore
    await token.connect(tester).approve(registratorAddress, lockAmount)
    // @ts-ignore
    await registrator.connect(tester).register(tester.address, 'some-fingerprint')
    
    for (let i = 0; i < defaultLockBlocks; i++) {
      await network.provider.send("evm_mine")
    }
    
    // @ts-ignore
    await expect(registrator.connect(tester).unregister(tester.address, lockAmount, 'some-other-fingerprint')).to.be.revertedWith("No unlockables found")
  })
});
