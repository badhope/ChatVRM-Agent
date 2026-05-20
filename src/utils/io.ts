import * as readline from 'readline';

/**
 * 等待用户按回车键继续
 */
export function waitForEnter(message: string = '\n按回车键继续...'): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * 从 stdin 读取全部内容
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf8');

    const onData = (chunk: string) => chunks.push(Buffer.from(chunk));
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    };

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}
