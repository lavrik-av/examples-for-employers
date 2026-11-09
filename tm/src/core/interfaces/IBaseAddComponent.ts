import { OnInit, OnDestroy } from "@angular/core";
import { OnInitTranslateComponent } from "@core/misc/OnInitTranslateComponent";

/**
 * Abstract base class for "Add/Edit/Delete" asset components.
 *
 * Defines the contract that concrete add‑component classes must implement.
 * Extends `OnInitTranslateComponent` to inherit translation initialisation
 * and lifecycle hooks (`OnInit`, `OnDestroy`).
 *
 * @typeParam T - The shape of the entity being managed (defaults to `any`).
 */
export abstract class IBaseAddComponent extends OnInitTranslateComponent implements OnInit, OnDestroy {
  /** Sets up RxJS subscriptions (success/error streams, form change detection). */
  protected abstract initSubscribers(): void;

  /** Prepares the form for creating a new entity (populates from a freshly created default). */
  abstract prepareForm(title?: string): void;

  /** Prepares the form for editing an existing entity (populates from the current `newItem`). */
  abstract prepareEditForm(title?: string): void;

  /** Opens a bottom-sheet component and wires up dismiss/opened handlers. */
  abstract handle(component: any, param1?: any, param2?: number, param3?: string, title?: string): void;

  /** Handles the result from the icon-selection bottom sheet. */
  abstract handleIconSelect(icon: any): void;

  /** Handles the result from the text-input bottom sheet. */
  abstract handleTitleEnter(title: string): void;

  /** Handles a generic boolean confirmation (e.g. from a confirm dialog). */
  abstract handleConfirm(confirm: boolean): void;

  /** Patches a named form field with a boolean value. */
  abstract handleBoolean(field: string, value: boolean): void;

  /** Handles a delete confirmation — resolves the delete URL and sends the request. */
  abstract handleConfirmDelete(confirm: boolean): void;

  /** Placeholder click handler; subclasses override for template interaction. */
  abstract handleClick($event: Event): void;

  /** Placeholder for receiving a wide‑text edit value; override in subclasses. */
  abstract setTextEditWideValue(value: any): any;

  /** Navigates to the edit page for the given item. */
  abstract openItem($event: any): void;

  /** Navigates to the parent route (cancel action). */
  abstract cancel(): void;

  /** Validates the form and sends data to the API. */
  abstract save(): void;

  /** Delegates HTTP method update to the component service. */
  abstract updateMethod(method: string): void;

  /** Delegates API URL update to the component service. */
  abstract updateApiUrl(url: string): void;

  /** Delegates a data send to the component service. */
  abstract sendData(): void;

  /** The payload object that will be sent to the API on save. */
  payload: any;
}
