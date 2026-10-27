import type { CommandDefinition } from './types';
import type { ShellInternals } from './types';
import { invalidOption, options } from './helpers';
import { pluginCommand } from './plugin';

export function systemCommands(): CommandDefinition[] {
  return [whoami(), environment(), exportCommand(), help(), sudo(), truth('true', 0), truth('false', 1), pluginCommand()];
}

function whoami(): CommandDefinition {
  return {
    name: 'whoami', summary: 'Print the current user', usage: 'whoami',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'whoami', `-${parsed.unknown}`);
      ctx.stdout(`${ctx.user}\n`);
      return 0;
    },
  };
}

function environment(): CommandDefinition {
  return {
    name: 'env', summary: 'Print the environment', usage: 'env',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'env', `-${parsed.unknown}`);
      const values = Object.entries(ctx.shell.env)
        .filter(([name]) => name !== '?')
        .map(([name, value]) => `${name}=${value}`);
      ctx.stdout(`${values.join('\n')}\n`);
      return 0;
    },
  };
}

function exportCommand(): CommandDefinition {
  return {
    name: 'export', summary: 'Set an environment variable', usage: 'export NAME=VALUE',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'export', `-${parsed.unknown}`, 1, true);
      for (const assignment of parsed.args) {
        const [name, ...parts] = assignment.split('=');
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          ctx.stderr(`export: '${assignment}': not a valid identifier\n`);
          return 1;
        }
        ctx.shell.env[name] = parts.join('=');
      }
      return 0;
    },
  };
}

function help(): CommandDefinition {
  return {
    name: 'help', summary: 'Display information about commands', usage: 'help',
    run(ctx) {
      const parsed = options(ctx);
      if (parsed.unknown) return invalidOption(ctx, 'help', `-${parsed.unknown}`);
      const installed = ctx.shell.commands().filter((command) => command.available?.() !== false);
      ctx.stdout(installed.map((command) => `${command.name}\t${command.summary}`).join('\n') + '\n');
      return 0;
    },
  };
}

function sudo(): CommandDefinition {
  return {
    name: 'sudo', summary: 'Run a command as root', usage: 'sudo COMMAND [ARG ...]',
    async run(ctx) {
      // Like real sudo, options end at the command: in `sudo head -2 f`, the -2 belongs to head.
      const args = ctx.args[0] === '--' ? ctx.args.slice(1) : ctx.args;
      if (args[0]?.startsWith('-') && args[0] !== '-') return invalidOption(ctx, 'sudo', args[0].slice(0, 2));
      if (!args.length) {
        ctx.stderr('sudo: command required\n');
        return 1;
      }
      const result = await (ctx.shell as ShellInternals).runAsCommand(args, ctx.stdin, 'root', {
        stdout: ctx.stdout, stderr: ctx.stderr, readLine: ctx.readLine,
        signal: ctx.signal, terminal: ctx.terminal,
      });
      return result.code;
    },
  };
}

function truth(name: string, code: number): CommandDefinition {
  return {
    name, summary: `${name === 'true' ? 'Return success' : 'Return failure'}`, usage: name,
    run(ctx) {
      const parsed = options(ctx);
      return parsed.unknown ? invalidOption(ctx, name, `-${parsed.unknown}`) : code;
    },
  };
}
