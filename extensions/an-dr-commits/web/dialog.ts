const CLASS_DIALOG_ACTIVE = 'dialogActive';
const CLASS_DIALOG_INPUT_INVALID = 'inputInvalid';
const CLASS_DIALOG_NO_INPUT = 'noInput';

const enum DialogType {
	Form,
	ActionRunning,
	Message
}

const enum DialogInputType {
	Text,
	TextRef,
	TextArea,
	Select,
	Radio,
	Checkbox
}

interface DialogTextInput {
	readonly type: DialogInputType.Text;
	readonly name: string;
	readonly default: string;
	readonly placeholder: string | null;
	readonly info?: string;
}

interface DialogTextRefInput {
	readonly type: DialogInputType.TextRef;
	readonly name: string;
	readonly default: string;
	readonly info?: string;
}

interface DialogTextAreaInput {
	readonly type: DialogInputType.TextArea;
	readonly name: string;
	readonly default: string;
	readonly rows?: number;
	readonly info?: string;
}

type DialogSelectInput = {
	readonly type: DialogInputType.Select;
	readonly name: string;
	readonly options: ReadonlyArray<DialogSelectInputOption>;
	readonly default: string;
	readonly multiple?: false;
	readonly info?: string;
} | {
	readonly type: DialogInputType.Select;
	readonly name: string;
	readonly options: ReadonlyArray<DialogSelectInputOption>;
	readonly defaults: ReadonlyArray<string>;
	readonly multiple: true;
	readonly info?: string;
};

interface DialogRadioInput {
	readonly type: DialogInputType.Radio;
	readonly name: string;
	readonly options: ReadonlyArray<DialogRadioInputOption>;
	readonly default: string;
}

interface DialogCheckboxInput {
	readonly type: DialogInputType.Checkbox;
	readonly name: string;
	readonly value: boolean;
	readonly info?: string;
}

interface DialogSelectInputOption {
	readonly name: string;
	readonly value: string;
	readonly hint?: string;
	readonly hintKind?: 'upstream' | 'gone';
	readonly isCurrent?: boolean;
	readonly isRemoteDefault?: boolean;
	readonly remoteDefaultHint?: string;
}

interface DialogRadioInputOption {
	readonly name: string;
	readonly value: string;
}

type DialogInput = DialogTextInput | DialogTextRefInput | DialogTextAreaInput | DialogSelectInput | DialogRadioInput | DialogCheckboxInput;
type DialogInputValue = string | string[] | boolean;

type DialogTarget = {
	type: TargetType.Commit | TargetType.Ref | TargetType.CommitDetailsView;
	elem: HTMLElement;
	hash: string;
	ref?: string;
} | RepoTarget;

/**
 * Implements the Commits View's dialogs.
 */
class Dialog {
	private elem: HTMLElement | null = null;
	private target: DialogTarget | null = null;
	private actioned: (() => void) | null = null;
	private type: DialogType | null = null;
	private customSelects: { [inputIndex: string]: CustomSelect } = {};

	private static readonly WHITESPACE_REGEXP = /\s/gu;

	/**
	 * Show a confirmation dialog to the user.
	 * @param message A message outlining what the user is being asked to confirm.
	 * @param actionName The name of the affirmative action (e.g. "Yes, \<verb\>").
	 * @param actioned A callback to be invoked if the user takes the affirmative action.
	 * @param target The target that the dialog was triggered on.
	 */
	public showConfirmation(message: string, actionName: string, actioned: () => void, target: DialogTarget | null) {
		this.show(DialogType.Form, message, actionName, 'Cancel', () => {
			this.close();
			actioned();
		}, null, target);
	}

	/**
	 * Show a dialog presenting two options to the user.
	 * @param message A message outlining the decision the user has.
	 * @param buttonLabel1 The label for the primary (default) action.
	 * @param buttonAction1 A callback to be invoked when the primary (default) action is selected by the user.
	 * @param buttonLabel2 The label for the secondary action.
	 * @param buttonAction2 A callback to be invoked when the secondary action is selected by the user.
	 * @param target The target that the dialog was triggered on.
	 */
	public showTwoButtons(message: string, buttonLabel1: string, buttonAction1: () => void, buttonLabel2: string, buttonAction2: () => void, target: DialogTarget | null) {
		this.show(DialogType.Form, message, buttonLabel1, buttonLabel2, () => {
			this.close();
			buttonAction1();
		}, () => {
			this.close();
			buttonAction2();
		}, target);
	}

	/**
	 * Show a dialog asking the user to enter the name for a Git reference. The reference name will be validated before the dialog can be actioned.
	 * @param message A message outlining the purpose of the reference.
	 * @param defaultValue The default name of the reference.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the reference name as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showRefInput(message: string, defaultValue: string, actionName: string, actioned: (value: string) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.TextRef, name: '', default: defaultValue }
		], actionName, (values) => actioned(<string>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single checkbox input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param checkboxLabel The label to be displayed alongside the checkbox.
	 * @param checkboxValue The default value of the checkbox.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the checkbox value as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showCheckbox(message: string, checkboxLabel: string, checkboxValue: boolean, actionName: string, actioned: (value: boolean) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Checkbox, name: checkboxLabel, value: checkboxValue }
		], actionName, (values) => actioned(<boolean>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single select input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param defaultValue The default value for the select input.
	 * @param options An array containing the options for the select input.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the selected value as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showSelect(message: string, defaultValue: string, options: ReadonlyArray<DialogSelectInputOption>, actionName: string, actioned: (value: string) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Select, name: '', options: options, default: defaultValue }
		], actionName, (values) => actioned(<string>values[0]), target);
	}

	/**
	 * Show a dialog to the user with a single multi-select input.
	 * @param message A message outlining the purpose of the dialog.
	 * @param defaultValue The default value(s) for the select input.
	 * @param options An array containing the options for the select input.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the selected value(s) as the first argument).
	 * @param target The target that the dialog was triggered on.
	 */
	public showMultiSelect(message: string, defaultValues: ReadonlyArray<string>, options: ReadonlyArray<DialogSelectInputOption>, actionName: string, actioned: (value: string[]) => void, target: DialogTarget | null) {
		this.showForm(message, [
			{ type: DialogInputType.Select, name: '', options: options, defaults: defaultValues, multiple: true }
		], actionName, (values) => actioned(<string[]>values[0]), target);
	}

	/**
	 * Show a dialog to the user which can include any number of form inputs.
	 * @param message A message outlining the purpose of the dialog.
	 * @param inputs An array defining the form inputs to display in the dialog.
	 * @param actionName The name of the action that the user must choose to proceed.
	 * @param actioned A callback to be invoked when the action is triggered (with the form values as the first argument).
	 * @param target The target that the dialog was triggered on.
	 * @param secondaryActionName An optional name for the secondary action.
	 * @param secondaryActioned An optional callback to be invoked when the secondary action is selected by the user.
	 * @param includeLineBreak Should a line break be added between the message and form inputs.
	 */
	public showForm(message: string, inputs: ReadonlyArray<DialogInput>, actionName: string, actioned: (values: DialogInputValue[]) => void, target: DialogTarget | null, secondaryActionName: string = 'Cancel', secondaryActioned: ((values: DialogInputValue[]) => void) | null = null, includeLineBreak: boolean = true) {
		const multiElement = inputs.length > 1;
		const multiCheckbox = multiElement && inputs.every((input) => input.type === DialogInputType.Checkbox);
		const infoColRequired = inputs.some((input) => input.type !== DialogInputType.Checkbox && input.type !== DialogInputType.Radio && input.info);
		const inputRowsHtml = inputs.map((input, id) => {
			let inputHtml;
			if (input.type === DialogInputType.Radio) {
				inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormRadio">' +
					input.options.map((option, optionId) => '<label><input type="radio" name="dialogInput' + id + '" value="' + optionId + '"' + (option.value === input.default ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customRadio"></span>' + escapeHtml(option.name) + '</label>').join('<br>') +
					'</span></td>';
			} else {
				const infoHtml = input.info ? '<span class="dialogInfo" title="' + escapeHtml(input.info) + '">' + ICONS.info + '</span>' : '';
				if (input.type === DialogInputType.Select) {
					inputHtml = '<td class="inputCol"><div id="dialogFormSelect' + id + '"></div></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
				} else if (input.type === DialogInputType.Checkbox) {
					inputHtml = '<td class="inputCol"' + (infoColRequired ? ' colspan="2"' : '') + '><span class="dialogFormCheckbox"><label><input id="dialogInput' + id + '" type="checkbox"' + (input.value ? ' checked' : '') + ' tabindex="' + (id + 1) + '"/><span class="customCheckbox"></span>' + (multiElement && !multiCheckbox ? '' : input.name) + infoHtml + '</label></span></td>';
				} else if (input.type === DialogInputType.TextArea) {
					inputHtml = '<td class="inputCol"><textarea id="dialogInput' + id + '" rows="' + (input.rows ?? 6) + '" tabindex="' + (id + 1) + '">' + escapeHtml(input.default) + '</textarea></td>';
				} else {
					inputHtml = '<td class="inputCol"><input id="dialogInput' + id + '" type="text" value="' + escapeHtml(input.default) + '"' + (input.type === DialogInputType.Text && input.placeholder !== null ? ' placeholder="' + escapeHtml(input.placeholder) + '"' : '') + ' tabindex="' + (id + 1) + '"/></td>' + (infoColRequired ? '<td>' + infoHtml + '</td>' : '');
				}
			}
			return '<tr' + (input.type === DialogInputType.Radio ? ' class="mediumField"' : input.type !== DialogInputType.Checkbox ? ' class="largeField"' : '') + '>' + (multiElement && !multiCheckbox ? '<td>' + input.name + ': </td>' : '') + inputHtml + '</tr>';
		});

		const html = message + (includeLineBreak ? '<br>' : '') +
			'<table class="dialogForm ' + (multiElement ? multiCheckbox ? 'multiCheckbox' : 'multi' : 'single') + '">' +
			inputRowsHtml.join('') +
			'</table>';

		const areFormValuesInvalid = () => this.elem === null || this.elem.classList.contains(CLASS_DIALOG_NO_INPUT) || this.elem.classList.contains(CLASS_DIALOG_INPUT_INVALID);
		const getFormValues = () => inputs.map((input, index) => {
			if (input.type === DialogInputType.Radio) {
				// Iterate through all of the radio options to get the checked value
				const elems = <NodeListOf<HTMLInputElement>>document.getElementsByName('dialogInput' + index);
				for (let i = 0; i < elems.length; i++) {
					if (elems[i].checked) {
						return input.options[parseInt(elems[i].value)].value;
					}
				}
				return input.default; // If no option is checked, return the default value
			} else if (input.type === DialogInputType.Select) {
				return this.customSelects[index.toString()].getValue();
			} else {
				const elem = <HTMLInputElement>document.getElementById('dialogInput' + index);
				return input.type === DialogInputType.Checkbox
					? elem.checked // Checkboxes return a boolean indicating if the value is checked
					: elem.value; // All other fields return the value as a string
			}
		});

		this.show(DialogType.Form, html, actionName, secondaryActionName, () => {
			if (areFormValuesInvalid()) return;
			const values = getFormValues();
			this.close();
			actioned(values);
		}, secondaryActioned !== null ? () => {
			if (areFormValuesInvalid()) return;
			const values = getFormValues();
			this.close();
			secondaryActioned(values);
		} : null, target);

		// Create custom select inputs
		inputs.forEach((input, index) => {
			if (input.type === DialogInputType.Select) {
				this.customSelects[index.toString()] = new CustomSelect(input, 'dialogFormSelect' + index, index + 1, this.elem!);
			}
		});

		// If the dialog contains a TextRef input, attach event listeners for validation
		const textRefInput = inputs.findIndex((input) => input.type === DialogInputType.TextRef);
		if (textRefInput > -1) {
			let dialogInput = <HTMLInputElement>document.getElementById('dialogInput' + textRefInput), dialogAction = document.getElementById('dialogAction')!;
			if (dialogInput.value === '') this.elem!.classList.add(CLASS_DIALOG_NO_INPUT);
			dialogInput.addEventListener('keyup', () => {
				if (this.elem === null) return;
				if (initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution !== null) {
					const selectionStart = dialogInput.selectionStart, selectionEnd = dialogInput.selectionEnd;
					dialogInput.value = dialogInput.value.replace(Dialog.WHITESPACE_REGEXP, initialState.config.dialogDefaults.general.referenceInputSpaceSubstitution);
					dialogInput.selectionStart = selectionStart;
					dialogInput.selectionEnd = selectionEnd;
				}
				const noInput = dialogInput.value === '', invalidInput = dialogInput.value.match(REF_INVALID_REGEX) !== null;
				alterClass(this.elem, CLASS_DIALOG_NO_INPUT, noInput);
				if (alterClass(this.elem, CLASS_DIALOG_INPUT_INVALID, !noInput && invalidInput)) {
					dialogAction.title = invalidInput ? 'Unable to ' + actionName + ', one or more invalid characters entered.' : '';
				}
			});
		}

		if (inputs.length > 0 && (inputs[0].type === DialogInputType.Text || inputs[0].type === DialogInputType.TextRef)) {
			// If the first input is a text field, set focus to it and select any pre-filled value.
			const firstInput = <HTMLInputElement>document.getElementById('dialogInput0');
			firstInput.focus();
			firstInput.select();
		}
	}

	/**
	 * Show a message to the user in a dialog.
	 * @param html The HTML to display in the dialog.
	 */
	public showMessage(html: string) {
		this.show(DialogType.Message, html, null, 'Close', null, null, null);
	}

	/**
	 * Show an error to the user in a dialog.
	 * @param message The high-level category of the error.
	 * @param reason The error details.
	 * @param actionName An optional name for a primary action (if one is required).
	 * @param actioned An optional callback to be invoked when the primary action is triggered.
	 */
	public showError(message: string, reason: GG.ErrorInfo, actionName: string | null, actioned: (() => void) | null) {
		const onPrimaryAction = actionName !== null ? () => {
			this.close();
			if (actioned !== null) actioned();
		} : null;
		const onDismiss = () => {
			this.close();
			if (actionName === null && actioned !== null) actioned();
		};
		this.show(
			DialogType.Message,
			'<span class="dialogAlert">' + ICONS.alert + 'Error: ' + message + '</span>' + (reason !== null ? '<br><span class="messageContent errorContent">' + escapeHtml(reason).split('\n').join('<br>') + '</span>' : ''),
			actionName,
			'Dismiss',
			onPrimaryAction,
			onDismiss,
			null
		);
	}

	/**
	 * Show a dialog when pull fails due to unstaged changes, offering stash options.
	 * @param files The list of files with unstaged changes.
	 * @param onStashAndReapply Callback when the user chooses to stash and re-apply after pull.
	 * @param onStashOnly Callback when the user chooses to stash only (no re-apply).
	 */
	public showPullUnstagedChanges(files: string[], onStashAndReapply: () => void, onStashOnly: () => void) {
		closeDialogAndContextMenu();
		this.type = DialogType.Message;
		this.target = null;
		eventOverlay.create('dialogBacking', null, null);

		const fileListHtml = '<div class="dialogStashFileList"><ul>' +
			files.map((f) => '<li>' + escapeHtml(f) + '</li>').join('') +
			'</ul></div>';
		const html = '<b>How to Proceed?</b><br><span class="messageContent">The following files have unstaged changes:</span>' +
			fileListHtml +
			'<br>' +
			'<div id="dialogAction" class="roundedBtn">Stash &amp; Re-apply</div>' +
			'<div id="dialogAction2" class="roundedBtn">Stash Only</div>' +
			'<div id="dialogSecondaryAction" class="roundedBtn">Cancel</div>';

		const dialog = document.createElement('div'), dialogContent = document.createElement('div');
		dialog.className = 'dialog';
		dialogContent.className = 'dialogContent';
		dialogContent.innerHTML = html;
		dialog.appendChild(dialogContent);
		this.elem = dialog;
		document.body.appendChild(dialog);

		let docHeight = document.body.clientHeight, dialogHeight = dialog.clientHeight + 2;
		if (dialogHeight > 0.8 * docHeight) {
			dialogContent.style.height = Math.round(0.8 * docHeight - 22) + 'px';
			dialogHeight = Math.round(0.8 * docHeight);
		}
		dialog.style.top = Math.max(Math.round((docHeight - dialogHeight) / 2), 10) + 'px';

		const self = this;
		document.getElementById('dialogAction')!.addEventListener('click', () => { self.close(); onStashAndReapply(); });
		document.getElementById('dialogAction2')!.addEventListener('click', () => { self.close(); onStashOnly(); });
		document.getElementById('dialogSecondaryAction')!.addEventListener('click', () => self.close());
		this.actioned = () => { self.close(); onStashAndReapply(); };
	}

	/**
	 * Show a dialog to indicate that an action is currently running.
	 * @param action A short name that identifies the action that is running.
	 */
	public showActionRunning(action: string) {
		this.show(DialogType.ActionRunning, '<span class="actionRunning">' + ICONS.loading + action + ' ...</span>', null, 'Dismiss', null, null, null);
	}

	/**
	 * Show a dialog in the Commits View.
	 * @param type The type of dialog being shown.
	 * @param html The HTML content for the dialog.
	 * @param actionName The name of the primary (default) action.
	 * @param secondaryActionName The name of the secondary action.
	 * @param actioned A callback to be invoked when the primary (default) action is selected by the user.
	 * @param secondaryActioned A callback to be invoked when the secondary action is selected by the user.
	 * @param target The target that the dialog was triggered on.
	 */
	private show(type: DialogType, html: string, actionName: string | null, secondaryActionName: string, actioned: (() => void) | null, secondaryActioned: (() => void) | null, target: DialogTarget | null) {
		closeDialogAndContextMenu();

		this.type = type;
		this.target = target;
		eventOverlay.create('dialogBacking', null, null);

		const dialog = document.createElement('div'), dialogContent = document.createElement('div');
		dialog.className = 'dialog';
		dialogContent.className = 'dialogContent';
		dialogContent.innerHTML = html + '<br>' + (actionName !== null ? '<div id="dialogAction" class="roundedBtn">' + actionName + '</div>' : '') + '<div id="dialogSecondaryAction" class="roundedBtn">' + secondaryActionName + '</div>';
		dialog.appendChild(dialogContent);
		this.elem = dialog;
		document.body.appendChild(dialog);

		let docHeight = document.body.clientHeight, dialogHeight = dialog.clientHeight + 2;
		if (dialogHeight > 0.8 * docHeight) {
			dialogContent.style.height = Math.round(0.8 * docHeight - 22) + 'px';
			dialogHeight = Math.round(0.8 * docHeight);
		}
		dialog.style.top = Math.max(Math.round((docHeight - dialogHeight) / 2), 10) + 'px';
		if (actionName !== null && actioned !== null) {
			document.getElementById('dialogAction')!.addEventListener('click', actioned);
			this.actioned = actioned;
		}
		document.getElementById('dialogSecondaryAction')!.addEventListener('click', secondaryActioned !== null ? secondaryActioned : () => this.close());

		if (this.target !== null && this.target.type !== TargetType.Repo) {
			alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
		}
	}

	/**
	 * Close the dialog (if one is currently open in the Commits View).
	 */
	public close() {
		eventOverlay.remove();
		if (this.elem !== null) {
			this.elem.remove();
			this.elem = null;
		}
		alterClassOfCollection(<HTMLCollectionOf<HTMLElement>>document.getElementsByClassName(CLASS_DIALOG_ACTIVE), CLASS_DIALOG_ACTIVE, false);
		this.target = null;
		Object.keys(this.customSelects).forEach((index) => this.customSelects[index].remove());
		this.customSelects = {};
		this.actioned = null;
		this.type = null;
	}

	/**
	 * Close the action running dialog (if one is currently open in the Commits View).
	 */
	public closeActionRunning() {
		if (this.type === DialogType.ActionRunning) this.close();
	}

	/**
	 * Submit the primary action of the dialog.
	 */
	public submit() {
		if (this.actioned !== null) this.actioned();
	}

	/**
	 * Refresh the dialog (if one is currently open in the Commits View). If the dialog has a dynamic source, re-link
	 * it to the newly rendered HTML Element, or close it if the target is no longer visible in the Commits View.
	 * @param commits The new array of commits that is rendered in the Commits View.
	 */
	public refresh(commits: ReadonlyArray<GG.GitCommit>) {
		if (!this.isOpen() || this.target === null || this.target.type === TargetType.Repo) {
			// Don't need to refresh if: no dialog is open, it is not dynamic, or it is not reliant on commit changes
			return;
		}

		const commitIndex = commits.findIndex((commit) => commit.hash === (<CommitTarget | RefTarget>this.target).hash);
		if (commitIndex > -1) {
			// The commit still exists

			const commitElem = findCommitElemWithId(getCommitElems(), commitIndex);
			if (commitElem !== null) {
				if (typeof this.target.ref === 'undefined') {
					// Dialog is only dependent on the commit itself
					if (this.target.type !== TargetType.CommitDetailsView) {
						this.target.elem = commitElem;
						alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
					}
					return;
				} else {
					// Dialog is dependent on the commit and ref
					const elems = <NodeListOf<HTMLElement>>commitElem.querySelectorAll('[data-fullref]');
					for (let i = 0; i < elems.length; i++) {
						if (elems[i].dataset.fullref! === this.target.ref) {
							this.target.elem = this.target.type === TargetType.Ref ? elems[i] : commitElem;
							alterClass(this.target.elem, CLASS_DIALOG_ACTIVE, true);
							return;
						}
					}
				}
			}
		}

		this.close();
	}

	/**
	 * Is a dialog currently open in the Commits View.
	 * @returns TRUE => A dialog is open, FALSE => No dialog is open
	 */
	public isOpen() {
		return this.elem !== null;
	}

	/**
	 * Is the target of the dialog dynamic (i.e. is it tied to a Git object & HTML Element in the Commits View).
	 * @returns TRUE => The dialog is dynamic, FALSE => The dialog is not dynamic
	 */
	public isTargetDynamicSource() {
		return this.isOpen() && this.target !== null;
	}

	/**
	 * Get the type of the dialog that is currently open.
	 * @returns The type of the dialog.
	 */
	public getType() {
		return this.type;
	}
}

