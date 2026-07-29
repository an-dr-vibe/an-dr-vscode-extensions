export interface BaseMessage {
	readonly command: string;
}

export interface RepoRequest extends BaseMessage {
	readonly repo: string;
}

export interface ResponseWithErrorInfo extends BaseMessage {
	readonly error: ErrorInfo;
}

export interface ResponseWithMultiErrorInfo extends BaseMessage {
	readonly errors: ErrorInfo[];
}

export type ErrorInfo = string | null;

export const enum ErrorInfoExtensionPrefix {
	PushTagCommitNotOnRemote = 'VSCODE_GIT_GRAPH:PUSH_TAG:COMMIT_NOT_ON_REMOTE:'
}

type PrimitiveTypes = string | number | boolean | symbol | bigint | undefined | null;

export type Writeable<T> = { -readonly [K in keyof T]: T[K] };

export type DeepReadonly<T> = T extends PrimitiveTypes
	? T
	: T extends (Array<infer U> | ReadonlyArray<infer U>)
	? ReadonlyArray<DeepReadonly<U>>
	: { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type DeepWriteable<T> = T extends PrimitiveTypes
	? T
	: T extends (Array<infer U> | ReadonlyArray<infer U>)
	? Array<DeepWriteable<U>>
	: { -readonly [K in keyof T]: DeepWriteable<T[K]> };
