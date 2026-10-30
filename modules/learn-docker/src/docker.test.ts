import { validateCourse, type LessonStatus } from '@tuxos/lessons';
import { createLocalSystem, type KeyValueStorage, type SystemClient, type TerminalSession } from '@tuxos/system';
import { describe, expect, it } from 'vitest';
import { ago, curl, docker, table } from './cli';
import { DockerEngine } from './engine';
import { course, learnDocker } from './index';

function cli() {
  let now = 1_000_000;
  const engine = new DockerEngine(undefined, () => now);
  return {
    engine,
    run: (line: string) => docker(engine, line.split(' ').filter(Boolean), now),
    curl: (line: string) => curl(engine, line.split(' ').slice(1)),
    wait: (ms: number) => { now += ms; },
  };
}

describe('docker CLI', () => {
  it('pulls on first run, prints hello-world, and lists the exited container', () => {
    const { run, wait } = cli();
    const first = run('run hello-world');
    expect(first.code).toBe(0);
    expect(first.stdout)
      .toMatch(/^Unable to find image 'hello-world:latest' locally\nlatest: Pulling from library\/hello-world/);
    expect(first.stdout).toContain('Hello from Docker!');
    expect(first.stdout).not.toContain('docker.io/library');
    expect(run('run hello-world').stdout).not.toContain('Unable to find image');
    wait(5000);
    const ps = run('ps -a').stdout.split('\n');
    expect(ps[0])
      .toBe('CONTAINER ID   IMAGE         COMMAND    CREATED         STATUS                     PORTS   NAMES');
    expect(ps[1])
      .toMatch(/^[0-9a-f]{12} {3}hello-world {3}"\/hello" {3}5 seconds ago {3}Exited \(0\) 5 seconds ago {11}\w+_\w+$/);
    expect(run('ps').stdout.trim().split('\n')).toHaveLength(1);
  });

  it('fails like Docker for an image that does not exist', () => {
    const { run } = cli();
    expect(run('run no-such-image')).toEqual({
      stdout: '',
      stderr: "Unable to find image 'no-such-image:latest' locally\n"
        + 'docker: Error response from daemon: pull access denied '
        + "for no-such-image, repository does not exist or may require 'docker login': denied: requested access to "
        + 'the resource is denied\n',
      code: 125,
    });
  });

  it('runs a detached web server, serves it on the published port, and logs the request', () => {
    const { run, curl: fetch } = cli();
    const started = run('run -d --name web -p 8080:80 nginx');
    expect(started.stdout).toMatch(/\n[0-9a-f]{64}\n$/);
    expect(run('ps').stdout).toMatch(/0\.0\.0\.0:8080->80\/tcp {3}web\n$/);
    expect(fetch('curl localhost:8080').stdout).toContain('<title>Welcome to nginx!</title>');
    expect(fetch('curl http://127.0.0.1:8080/missing').stdout).toContain('404 Not Found');
    expect(run('logs web').stdout).toContain('"GET / HTTP/1.1" 200');
    expect(fetch('curl localhost:9999')).toMatchObject({ code: 7, stderr: expect.stringContaining('port 9999') });
    expect(fetch('curl example.com')).toMatchObject({ code: 6 });
  });

  it('refuses duplicate names and taken ports with Docker\'s messages', () => {
    const { run } = cli();
    run('run -d --name web -p 8080:80 nginx');
    expect(run('run -d --name web nginx')).toMatchObject({
      code: 125, stderr: expect.stringContaining('Conflict. The container name "/web" is already in use'),
    });
    expect(run('run -d -p 8080:80 nginx')).toMatchObject({
      code: 125, stderr: expect.stringContaining('port is already allocated'),
    });
  });

  it('protects running containers and used images, and cleans up in the right order', () => {
    const { run } = cli();
    run('run -d --name web nginx');
    expect(run('rm web')).toMatchObject({ code: 1, stderr: expect.stringContaining('container is running') });
    expect(run('rmi nginx')).toMatchObject({ code: 1, stderr: expect.stringContaining('(must force)') });
    expect(run('stop web')).toEqual({ stdout: 'web\n', stderr: '', code: 0 });
    expect(run('rm web')).toEqual({ stdout: 'web\n', stderr: '', code: 0 });
    expect(run('rmi nginx')).toMatchObject({ code: 0, stdout: expect.stringContaining('Untagged: nginx:latest') });
    expect(run('rm web')).toEqual({
      stdout: '', stderr: 'Error response from daemon: No such container: web\n', code: 1,
    });
  });

  it('needs POSTGRES_PASSWORD, then passes environment variables into the container', () => {
    const { run } = cli();
    expect(run('run postgres')).toMatchObject({ code: 1, stderr: expect.stringContaining('POSTGRES_PASSWORD') });
    expect(run('run -d --name db -e POSTGRES_PASSWORD=secret postgres').code).toBe(0);
    expect(run('exec db env').stdout).toContain('POSTGRES_PASSWORD=secret\n');
    expect(run('exec db nope')).toMatchObject({
      code: 127, stderr: expect.stringContaining('executable file not found'),
    });
  });

  it('runs commands inside one-shot containers and removes them with --rm', () => {
    const { run } = cli();
    expect(run('run alpine cat /etc/os-release').stdout).toContain('Alpine Linux');
    expect(run('run --rm alpine echo hi').stdout).toMatch(/hi\n$/);
    expect(run('ps -a').stdout.trim().split('\n')).toHaveLength(2);
    expect(run('run -it ubuntu')).toMatchObject({ code: 1, stderr: expect.stringContaining('interactive shells') });
  });

  it('explains usage mistakes', () => {
    const { run } = cli();
    expect(run('run')).toMatchObject({
      code: 1, stderr: expect.stringContaining('"docker run" requires at least 1 argument'),
    });
    expect(run('run --bogus nginx')).toMatchObject({
      code: 125, stderr: 'unknown flag: --bogus\nSee \'docker run --help\'.\n',
    });
    expect(run('fly')).toMatchObject({ code: 1, stderr: expect.stringContaining("'fly' is not a docker command") });
    expect(run('').stdout).toContain('Usage:  docker [OPTIONS] COMMAND');
  });

  it('formats tables and durations like Docker', () => {
    expect(table(['A', 'LONG'], [['xyz', '1']])).toBe('A     LONG\nxyz   1\n');
    expect([ago(5000), ago(60_000), ago(5 * 60_000), ago(3_600_000)]).toEqual(
      ['5 seconds', 'About a minute', '5 minutes', 'About an hour'],
    );
  });
});

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function boot(storage = memory()): Promise<{ system: SystemClient; terminal: TerminalSession }> {
  const system = createLocalSystem({
    storage, modules: [{ manifest: learnDocker.manifest, load: async () => learnDocker }],
  });
  await system.boot('ada');
  return { system, terminal: await system.createTerminal() };
}

describe('Learn Docker in the system', () => {
  it('keeps Docker state across restarts, in a directory only root can read', async () => {
    const storage = memory();
    const first = await boot(storage);
    await first.terminal.run('docker run -d --name web nginx');
    expect(await first.terminal.run('ls /var/lib/docker')).toMatchObject({
      code: 2, stderr: expect.stringContaining('Permission denied'),
    });
    await first.system.flush();
    const second = await boot(storage);
    expect((await second.terminal.run('docker ps')).stdout).toContain('web');
  });

  it('is a valid course', () => {
    expect(validateCourse(course)).toEqual([]);
  });

  it.each(course.lessons.map((lesson) => [lesson.id]))('lesson %s is completed by its own solution', async (id) => {
    const { system } = await boot();
    const terminal = await system.createTerminal({ learningModule: 'learn-docker' });
    const lesson = course.lessons.find((each) => each.id === id)!;
    expect(await system.dispatch('learn-docker.start', { lesson: id })).toMatchObject({ ok: true });
    for (const step of lesson.solution) if (typeof step === 'string') await terminal.run(step);
    const status = await system.dispatch<LessonStatus>('learn-docker.status', {});
    expect(status.ok && status.value.active).toBeNull();
    expect(status.ok && status.value.lessons.find((each) => each.id === id)?.completed).toBe(lesson.steps.length);
  });
});
