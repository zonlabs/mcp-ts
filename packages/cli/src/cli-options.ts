export function validatePort(port: number, label = "port"): number {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

export function parsePortOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return validatePort(Number(value), "--port");
}

export function assertKnownOptions(
  args: string[],
  options: Record<string, "boolean" | "value">,
): void {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith("-")) continue;
    const kind = options[argument];
    if (!kind) throw new Error(`Unknown option: ${JSON.stringify(argument)}`);
    if (kind === "value") index += 1;
  }
}
