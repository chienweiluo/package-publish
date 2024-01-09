import fs from "fs"
import { FSWatcher } from "chokidar"
import shell from "shelljs"
import { debounce } from "lodash"
import { step } from "./utils/common"
import { inspect } from "util"

shell.config.fatal = true

type Types = "message" | "stack" | "name" | string

export type JSONError = Partial<Record<Types, any>>

export function errorToJson(error: string | JSONError): JSONError {
  if (typeof error === "string") {
    return { message: error }
  }

  const jsonError: Record<Types, any> = {
    message: error.message,
    stack: error.stack,
    name: error.name
  }

  Object.keys(error as JSONError).forEach((key: string) => {
    jsonError[key] = error[key]
  })

  return jsonError
}

const dependencies = "./packages"

const build = () => shell.exec("pnpm run build")

const init = () => {
  const watcher = new FSWatcher({
    ignored: /(^|[\/\\])\..|node_modules|\.git|dist/, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: true
  })
  watcher
    .add(dependencies)
    .on("ready", () => {
      step("Ready to watch package change")
    })
    .on(
      "change",
      debounce((path: string, stats: fs.Stats) => {
        step(`Changed: ${path}`)
        step(stats)

        try {
          build()
        } catch (e: unknown) {
          const json = errorToJson(e as Error)
          const errorOutput = inspect(json.message || json, false, null, true)

          step(`Can't run build-watch because: \r\n + ${errorOutput}`)
        }
      }, 500)
    )
    .on("error", (e) => {
      console.error(`Watcher error: ${errorToJson(e)}`)
    })
}

Promise.resolve(true)
  .then(build)
  .then(init)
  .catch((err) => {
    console.error(`Process error: ${errorToJson(err as Error)}`)
    process.exit(1)
  })
