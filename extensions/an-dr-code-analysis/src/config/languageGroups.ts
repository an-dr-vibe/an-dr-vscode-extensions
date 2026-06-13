export const C_CPP_LANG_IDS = new Set([
    'c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp',
]);

export const TS_JS_LANG_IDS = new Set([
    'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
]);

export const PYTHON_LANG_IDS = new Set(['python']);

export const LSP_LANG_IDS = new Set([...C_CPP_LANG_IDS, ...TS_JS_LANG_IDS]);
