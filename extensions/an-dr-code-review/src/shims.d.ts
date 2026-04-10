declare module 'which' {
	function which(cmd: string, cb: (err: Error | null, resolvedPath?: string) => void): void;
	export default which;
}

declare module '@vscode/iconv-lite-umd' {
	export function encodingExists(encoding: string): boolean;
	export function decode(buffer: Buffer, encoding: string): string;
}

declare module 'file-type' {
	type FileTypeResult = { ext: string; mime: string } | undefined;
	function filetype(buffer: Buffer): FileTypeResult;
	export default filetype;
}

declare module 'byline' {
	import { Readable, Transform } from 'stream';

	interface BylineStream extends Readable {}

	interface LineStreamOptions {
		encoding?: BufferEncoding;
	}

	function byline(stream: Readable): BylineStream;

	namespace byline {
		class LineStream extends Transform {
			constructor(options?: LineStreamOptions);
		}
	}

	export default byline;
}
