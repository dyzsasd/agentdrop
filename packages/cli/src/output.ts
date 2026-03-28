const isTTY = process.stdout.isTTY;
let forceJson = false;
let forceHuman = false;

export function setOutputMode(opts: { json?: boolean; human?: boolean }) {
  if (opts.json) forceJson = true;
  if (opts.human) forceHuman = true;
}

function shouldJson(): boolean {
  if (forceJson) return true;
  if (forceHuman) return false;
  return !isTTY;
}

export function output(data: Record<string, unknown>, humanFormat?: () => string): void {
  if (shouldJson()) {
    console.log(JSON.stringify(data, null, 2));
  } else if (humanFormat) {
    console.log(humanFormat());
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function errorOutput(code: string, message: string): void {
  if (shouldJson()) {
    console.error(JSON.stringify({ ok: false, error: { code, message } }));
  } else {
    console.error(`Error [${code}]: ${message}`);
  }
}
