import { spawn } from 'child_process'

export interface PythonRunResult {
  stdout: string
  stderr: string
  exitCode: number
  command: string
}

export interface PythonRunOptions {
  scriptPath: string
  args: string[]
  timeoutMs?: number
  cwd?: string
}

export function runPythonScript(options: PythonRunOptions): Promise<PythonRunResult> {
  const { scriptPath, args, timeoutMs = 60_000, cwd = process.cwd() } = options

  return new Promise((resolve) => {
    let resolved = false

    const tryBin = (bin: string) => {
      const proc = spawn(bin, [scriptPath, ...args], { cwd, timeout: timeoutMs })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      proc.on('error', () => {
        if (resolved) return
        if (bin === 'python3') {
          tryBin('python')
        } else {
          resolved = true
          resolve({
            stdout: '',
            stderr: '找不到 Python 解释器，请确保已安装 Python 3 并添加到 PATH。',
            exitCode: 1,
            command: bin,
          })
        }
      })

      proc.on('close', (code: number | null) => {
        if (resolved) return
        if (code === 9009 && bin === 'python3') {
          tryBin('python')
          return
        }
        resolved = true
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
          command: bin,
        })
      })
    }

    tryBin('python3')
  })
}
