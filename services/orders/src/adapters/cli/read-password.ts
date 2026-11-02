// Password input for the operator commands: a hidden prompt on a terminal,
// otherwise the whole of stdin (scripts, tests). Never a flag or a variable.

/** Thrown when the operator cancels the prompt with Ctrl-C. */
export class PromptCancelledError extends Error {
  override readonly name = 'PromptCancelledError';
  constructor() {
    super('Cancelled.');
  }
}

/** stdin larger than this is not a password: stop reading instead of buffering it. */
const MAX_STDIN_BYTES = 4096;

export async function readPassword(
  input: NodeJS.ReadStream,
  output: NodeJS.WritableStream,
): Promise<string> {
  return input.isTTY ? promptHidden(input, output, 'Password: ') : readStdin(input);
}

/** Reads stdin to the end; drops one trailing line break (`echo pw |` adds one). */
async function readStdin(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_STDIN_BYTES) throw new Error('The password on stdin is too long.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** Raw-mode prompt that echoes nothing. Enter ends it, Backspace edits, Ctrl-C cancels. */
function promptHidden(
  input: NodeJS.ReadStream,
  output: NodeJS.WritableStream,
  prompt: string,
): Promise<string> {
  output.write(prompt);
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();

  return new Promise((resolve, reject) => {
    let chars: string[] = [];
    const finish = (): void => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          finish();
          resolve(chars.join(''));
          return;
        }
        if (ch === '\u0003') {
          finish();
          reject(new PromptCancelledError());
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          chars = chars.slice(0, -1);
        } else if (ch >= ' ') {
          chars.push(ch);
        }
        // other control characters are ignored
      }
    };
    input.on('data', onData);
  });
}
