import { runPnpmPublish } from "./utils/npm"

async function main(): Promise<void> {
  if (!process.env.REGISTRY) {
    throw new Error(`Please provide process.env.REGISTRY`)
  }

  await runPnpmPublish({ registry: `https://${process.env.REGISTRY}` })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
