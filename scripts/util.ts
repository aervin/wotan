import * as cp from 'child_process';
import * as fs from 'fs';

export interface Dependencies {
    [name: string]: string;
}

export interface PackageData {
    name: string;
    version: string;
    private?: boolean;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    peerDependencies?: Dependencies;
}

export function isTreeClean(directories: string[] = [], exceptions: string[] = []) {
    cp.spawnSync('git', ['update-index', '-q', '--refresh'], {stdio: 'ignore'});
    const modified = cp.spawnSync(
        'git',
        ['diff-index', '--exit-code', '-z', '--name-only', 'HEAD', '--', ...directories],
        {encoding: 'utf8'},
    );
    if (modified.status !== 0 && splitNullDelimitedList(modified.stdout).some((changed) => !exceptions.includes(changed)))
        return false;
    const untracked = cp.spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...directories]);
    if (untracked.status !== 0)
        throw new Error(untracked.stderr.toString());
    return untracked.stdout.length === 0;
}

export function ensureCleanTree(directories: string[] = [], exceptions?: string[]) {
    if (isTreeClean(directories, exceptions))
        return;
    console.error('Working directory contains uncommited changes.');
    cp.spawnSync('git', ['status', '--', ...directories], {stdio: 'inherit'});
    throw process.exit(1);
}

export function getCurrentBranch() {
    return cp.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
}

export function ensureBranch(name: string) {
    const branch = getCurrentBranch();
    if (branch !== name)
        throw new Error(`Expected current branch to be ${name}, but it's actually ${branch}.`);
}

export function getLastRelaseTag() {
    return cp.spawnSync('git', ['describe', '--tags', '--match=v*.*.*', '--abbrev=0'], {encoding: 'utf8'}).stdout.trim();
}

export function getPackages() {
    const packages = new Map<string, PackageData>(
        fs.readdirSync('packages').map((name): [string, PackageData] => {
            return [name, require(`../packages/${name}/package.json`)];
        }),
    );
    const publicPackages = new Map<string, PackageData>(Array.from(packages).filter((v) => !v[1].private));
    return {
        packages,
        publicPackages,
    };
}

export function getChangedPackageNames(startRev: string, packageNames: Iterable<string>) {
    const packageDirs = Array.from(packageNames, (p) => 'packages/' + p);
    if (packageDirs.length === 0)
        return new Set<string>();
    const diff = cp.spawnSync(
        'git', ['diff-tree', '-r', '--name-only', '-z', startRev, 'HEAD', ...packageDirs],
        {encoding: 'utf8'},
    ).stdout;
    const result = new Set<string>();
    for (const file of splitNullDelimitedList(diff).filter(filterFiles))
        result.add(file.split(/[/\\]/)[1]);
    return result;
}

function filterFiles(file: string): boolean {
    const parts = file.split(/[/\\]/);
    switch (parts[2]) {
        case 'test':
        case 'tsconfig.json':
        case '.npmignore':
        case '.gitignore':
        case '.gitkeep':
        case 'LICENSE':
        case 'NOTICE':
        case 'README.md':
            return false;
    }
    switch (parts[parts.length - 1]) {
        case '.wotanrc.yaml':
        case 'tslint.json':
            return false;
    }
    return true;
}

export function writeManifest(path: string, content: PackageData) {
    fs.writeFileSync(path, JSON.stringify(content, undefined, 2) + '\n');
}

export function execAndLog(command: string) {
    console.log(`> ${command}`);
    cp.execSync(command, {stdio: 'inherit'});
}

function splitNullDelimitedList(str: string): string[] {
    return str.split('\0').slice(0, -1);
}
