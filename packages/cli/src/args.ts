/** 零依赖参数解析：--key value / --flag / "positional" */
export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

export function parse(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

export function str(flags: Map<string, string | boolean>, key: string): string | undefined {
  const v = flags.get(key);
  return typeof v === "string" ? v : undefined;
}

export function bool(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.get(key) === true || typeof flags.get(key) === "string";
}

/** 从 "a b c" 或 a,b,c 收集多值 flag 的所有出现（--goal x --goal y） */
export function multi(argv: string[], key: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${key}` && argv[i + 1] !== undefined) {
      values.push(argv[i + 1]);
      i++;
    }
  }
  return values;
}
