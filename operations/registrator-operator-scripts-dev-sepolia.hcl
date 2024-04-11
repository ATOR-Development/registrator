job "registrator-operator-scripts-dev-sepolia" {
    datacenters = ["ator-fin"]
    type = "batch"

    reschedule {
        attempts = 0
    }

    task "registrator-operator-scripts-dev-task" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/ator-development/registrator:0.2.2"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/operator-scripts.ts"]
        }

        vault {
            policies = ["registrator-sepolia-dev"]
        }

        template {
            data = <<EOH
            {{with secret "kv/registrator/sepolia/dev"}}
                CONSUL_TOKEN="{{.Data.data.CONSUL_TOKEN}}"
                JSON_RPC="{{.Data.data.JSON_RPC}}"
                REGISTRATOR_OPERATOR_ADDRESS="{{.Data.data.REGISTRATOR_OPERATOR_ADDRESS}}"
            {{end}}
            EOH
            destination = "secrets/file.env"
            env         = true
        }

        env {
            PHASE="dev"
            CONSUL_IP="127.0.0.1"
            CONSUL_PORT="8500"
            REGISTRATOR_CONSUL_KEY="registrator/sepolia/dev/address"
            ATOR_TOKEN_CONSUL_KEY="ator-token/sepolia/dev/address"
        }

        restart {
            attempts = 0
            mode = "fail"
        }

        resources {
            cpu    = 4096
            memory = 4096
        }
    }
}
