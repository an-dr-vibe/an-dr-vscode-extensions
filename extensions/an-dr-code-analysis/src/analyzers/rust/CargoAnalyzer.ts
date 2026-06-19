import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { RUST_LANG_IDS } from '../../config/languageGroups';

interface CargoPackage {
    id: string;
    name: string;
    manifest_path: string;
    dependencies: { name: string; kind: string | null }[];
}

interface CargoMetadata {
    packages: CargoPackage[];
    workspace_members: string[];
}

/** Spawn `cargo metadata --no-deps` and return its stdout.
 *  --no-deps limits the packages array to workspace members only, keeping output small. */
function runCargoMetadata(workspaceRoot: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) { return Promise.resolve(''); }
    return new Promise(resolve => {
        const proc = child_process.spawn(
            'cargo',
            ['metadata', '--format-version', '1', '--no-deps'],
            { cwd: workspaceRoot },
        );
        let out = '';
        proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8'); });
        proc.on('error', err => { log.appendLine(`[CargoAnalyzer] cargo failed: ${err}`); resolve(''); });
        proc.on('close', () => {
            log.appendLine(`[CargoAnalyzer] cargo metadata returned ${out.length} chars`);
            resolve(out);
        });
        signal?.addEventListener('abort', () => { proc.kill(); resolve(''); }, { once: true });
    });
}

export class CargoAnalyzer implements IAnalyzer {
    readonly name = 'cargo';

    canHandle(request: AnalysisRequest): boolean {
        return RUST_LANG_IDS.has(request.context.langId) && request.graphType === 'componentDeps';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) { return null; }
        const workspaceRoot = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');

        const raw = await runCargoMetadata(workspaceRoot, signal);
        if (signal?.aborted || !raw) { return null; }

        let meta: CargoMetadata;
        try { meta = JSON.parse(raw) as CargoMetadata; }
        catch (e) { log.appendLine(`[CargoAnalyzer] failed to parse cargo metadata: ${e}`); return null; }

        const memberIds = new Set(meta.workspace_members);
        const members = meta.packages.filter(p => memberIds.has(p.id));
        if (members.length === 0) {
            log.appendLine('[CargoAnalyzer] no workspace members found');
            return null;
        }

        const memberByName = new Map(members.map(p => [p.name, p]));

        // Find which workspace package owns the active file (longest manifest directory prefix wins)
        const activeFile = context.filePath.replace(/\\/g, '/');
        const targetPkg = members.reduce<CargoPackage | undefined>((best, pkg) => {
            const pkgDir = path.dirname(pkg.manifest_path).replace(/\\/g, '/');
            if (!activeFile.startsWith(pkgDir)) { return best; }
            if (!best) { return pkg; }
            const bestDir = path.dirname(best.manifest_path).replace(/\\/g, '/');
            return pkgDir.length > bestDir.length ? pkg : best;
        }, undefined) ?? members[0];

        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];
        const edgeSet = new Set<string>();

        function addNode(pkg: CargoPackage, role: GraphNode['role']): void {
            if (!nodes.has(pkg.id)) {
                nodes.set(pkg.id, {
                    id: pkg.id,
                    label: pkg.name,
                    fullName: pkg.id,
                    filePath: path.dirname(pkg.manifest_path).replace(/\\/g, '/'),
                    role,
                    langId: 'rust',
                });
            }
        }

        function addEdge(srcId: string, dstId: string): void {
            const key = `${srcId}->${dstId}`;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ sourceId: srcId, targetId: dstId }); }
        }

        addNode(targetPkg, 'target');

        // Add all workspace members and intra-workspace dependency edges (skip dev-deps and external crates)
        for (const pkg of members) {
            if (pkg.id !== targetPkg.id) { addNode(pkg, 'external'); }
            for (const dep of pkg.dependencies) {
                if (dep.kind === 'dev') { continue; }
                const depPkg = memberByName.get(dep.name);
                if (!depPkg) { continue; }
                addEdge(pkg.id, depPkg.id);
            }
        }

        const graph: GraphModel = {
            graphType: 'componentDeps',
            targetId: targetPkg.id,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'medium',
            warnings: ['Only workspace-internal crate dependencies are shown; external crates are omitted.'],
        };
        return { graph };
    }
}
