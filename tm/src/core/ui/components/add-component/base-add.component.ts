import { ChangeDetectorRef, inject, OnDestroy, OnInit, ChangeDetectionStrategy, Component, Type, NgZone, isDevMode, DestroyRef, signal } from '@angular/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { StaticHelper } from '@core/helpers/static.helper';
import { IUserService } from '@core/interfaces/IUserService';
import { SuccessResponseHandler, ErrorResponseHandler } from '../../../misc/ResponseHandlers';
import { AppFormGroup } from '@core/form/AppFormGroup';
import { FormControls } from '@core/interfaces/FormControls';
import { IconBottomSheetComponent, TypeBottomSheetComponent } from '../bottom-sheet/icon-bottom-sheet/icon-bottom-sheet.component';
import { TextBottomSheetComponent } from '../bottom-sheet/text-bottom-sheet/text-bottom-sheet.component';
import { UserAssetsFactory } from '@core/helpers/factories/UserAssetsFactory';
import { IComponentService } from '@core/interfaces/IComponentService';
import { ComponentServiceParams } from '@core/models/ComponentServiceParams';
import { ConfirmBottomSheetComponent } from '../bottom-sheet/confirm-bottom-sheet/confirm-bottom-sheet.component';
import { IBaseAddComponent } from '../../../interfaces/BaseComponent/IBaseAddComponent';
import { ObjectListBottomSheetComponent } from '../bottom-sheet/object-list-bottom-sheet/object-list-bottom-sheet.component';
import { ObjectItem } from '@core/models/object-item';
import { NumberBottomSheetComponent } from '../bottom-sheet/number-bottom-sheet/number-bottom-sheet.component';
import { componentServiceProvider } from '@core/providers/componentServiceProvider';

@Component({
  selector: 'base-add-app',
  standalone: true,
  imports: [
    MatBottomSheetModule,
  ],
  providers: [
    componentServiceProvider
  ],
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush
})
/**
 * Abstract base component for "Add" (and "Edit"/"Delete") workflows for user assets
 * (categories, accounts, currencies, etc.).
 *
 * Provides a reusable skeleton that:
 * - Manages a reactive form (`AppFormGroup`) with change tracking.
 * - Orchestrates bottom‑sheet interactions (icon picker, text input, confirm dialogs,
 *   object lists, number input).
 * - Handles the full CRUD lifecycle: create a default asset, prepare a form for add or
 *   edit, save (create/update), and delete with confirmation.
 * - Wires up success/error response handlers via `IComponentService`.
 * - Exposes navigation helpers (`navUrl`, `cancel()`, `openItem()`, `location.back()`).
 *
 * @typeParam T - The shape of the entity being managed (e.g. `Category`, `InnerAccount`).
 *                Defaults to `any` when no generic argument is provided.
 *
 * @usageNotes
 * Subclasses **must**:
 * 1. Call `setForm()` to assign the typed form group.
 * 2. Call `initBase()` with service params and response handlers (usually from `ngOnInit`).
 * 3. Optionally override `prepareForm()` / `prepareEditForm()` for custom logic.
 *
 * ```typescript
 * class MyAddComponent extends BaseAddComponent<MyEntity> {
 *   constructor() {
 *     super();
 *     this.setForm(new AppFormGroup({ ... }));
 *   }
 *
 *   override ngOnInit() {
 *     super.ngOnInit();
 *     this.initBase(serviceParams, this.handleSuccess.bind(this));
 *   }
 * }
 * ```
 */
export class BaseAddComponent<T = any> extends IBaseAddComponent {

  /** The reactive form group used for data entry and validation. */
  protected form!: AppFormGroup<FormControls>;

  /** Observable that emits the current processing state of the data service. */
  protected processing$!: Observable<boolean>;

  /** Material bottom sheet service – used to open pickers, text editors, confirmations, etc. */
  protected bottomSheet = inject(MatBottomSheet);

  /** Core service that provides data‑layer operations (API calls) for this component. */
  private componentService = inject(IComponentService);

  /** Service that holds the current user state and provides user‑asset mutations. */
  protected userService = inject(IUserService);

  /** Angular change detector – manually triggered after form patches inside bottom‑sheet handlers. */
  protected cdr = inject(ChangeDetectorRef);

  /** Angular router – used for navigation (cancel, openItem, back). */
  protected router = inject(Router);

  /** Angular Location service – used to navigate back after a successful save. */
  protected location = inject(Location);

  /** DestroyRef for automatic RxJS cleanup via `takeUntilDestroyed`. */
  private readonly destroyRef = inject(DestroyRef);

  /** Navigation URL suffix (e.g. relative route) for cancel or redirect actions. */
  protected navUrl = '';

  /**
   * Signal that indicates whether the bottom sheet is closed (`true`) or open (`false`).
   * Prevents opening multiple sheets simultaneously.
   */
  protected readonly bottomSheetIsClosed = signal(true);

  /** Optional parent entity context (e.g. parent category when adding a sub‑category). */
  protected parentItem?: any;

  /**
   * The entity currently being created or edited.
   * Populated by `createUserAsset()` and later merged with form values on save.
   */
  protected newItem: T = {} as T;

  /** List of sub‑items or child entities associated with the current entity. */
  protected subItems: T[] = [];

  /** Indicates whether the underlying item has been changed via external operations. */
  protected itemChanged: boolean = false;

  /** Indicates whether the form values differ from the original `newItem` defaults. */
  protected formChanged: boolean = false;

  /** The API endpoint URL used for add (POST) operations. Injected by the subclass. */
  protected addUrl = '';

  /** The icon type identifier used for the icon bottom‑sheet (e.g. "categories", "accounts"). */
  protected typeIcon: string = '';

  /**
   * The asset type discriminator string (e.g. `"CATEGORIES"`, `"ACCOUNTS"`, `"CURRENCIES"`).
   * Used to select the correct factory, endpoint, and delete mappings.
   */
  protected assetsType: string = '';

  /** Translation key for the delete confirmation message. */
  protected deleteItemText: string = '';

  /** Route constant key used to build the edit URL (e.g. "EDIT_CATEGORY", "EDIT_ACCOUNT"). */
  protected itemEditConstant = '';

  /**
   * Callback invoked when the API returns a successful response.
   * Typically updates the user's asset list and shows a success toast.
   */
  protected successResponseHandler!: SuccessResponseHandler;

  /**
   * Optional callback invoked when the API returns an error.
   * If not provided, error handling falls back to the default toast mechanism.
   */
  protected errorResponseHandler?: ErrorResponseHandler;

  /** Reference to the `IconBottomSheetComponent` class – used as the component type to open. */
  protected IconBottomSheet = IconBottomSheetComponent;

  /** Reference to the `TextBottomSheetComponent` class – used as the component type to open. */
  protected TextBottomSheet = TextBottomSheetComponent;

  /** Reference to the `NumberBottomSheetComponent` class – used as the component type to open. */
  protected NumberBottomSheet = NumberBottomSheetComponent;

  /** Reference to the `TypeBottomSheetComponent` class – used as the component type to open. */
  protected TypeBottomSheet = TypeBottomSheetComponent;

  /** Reference to the confirmation bottom‑sheet class – used for generic confirmations. */
  protected ConfirmBottomSheet = ConfirmBottomSheetComponent;

  /** Reference to the confirmation bottom‑sheet class – used specifically for delete confirmations. */
  protected ConfirmDeleteBottomSheet = ConfirmBottomSheetComponent;

  /** Reference to the `ObjectListBottomSheetComponent` class – used for selecting from a list. */
  protected ObjectListBottomSheet = ObjectListBottomSheetComponent;

  /** Pre‑loaded list of icon objects for the icon picker bottom sheet. */
  protected icons: ObjectItem[] = [];

  /** List of form field names to compare when checking whether the form has changed. */
  protected fieldsToCheck: string[] = [];

  /**
   * Map of bottom‑sheet component types to their corresponding handler methods.
   * Populated by {@link prepareFormHandlers}.
   */
  protected handlers!: Map<any, (result: any) => void>;

  /**
   * Maps an asset type string to the full API endpoint URL for deleting that asset type.
   * Populated by {@link prepareDeleteAssetsMap}.
   */
  private deleteAssetsMap!: Map<string, string>;

  /** Translation key for the success toast shown after a successful operation (default: "COMMON.ADDED"). */
  protected successOperationText: string = 'COMMON.ADDED';

  /**
   * Subject used to cancel subscriptions from a previously opened bottom sheet
   * whenever a new one is opened, preventing stale handlers from firing.
   */
  private readonly bottomSheetDestroy = new Subject<void>();

  constructor() {
    super();
  }

  /**
   * Sets the reactive form group that the component will manage.
   * **Must** be called by subclasses **before** invoking `initBase()`.
   *
   * @param form - The typed `AppFormGroup` instance bound to the entity fields.
   */
  protected setForm(form: AppFormGroup<FormControls>): void {
    this.form = form;
  }

  /**
   * Angular lifecycle hook. Calls the parent `ngOnInit` to initialise translation
   * and base services. Subclasses **must** call `super.ngOnInit()`.
   */
  public override ngOnInit(): void {
    super.ngOnInit();
  }

  /**
   * Initialises the component with service parameters and response handlers.
   * This is the main bootstrap method that subclasses **must** call (typically from
   * `ngOnInit`) after the form has been set via `setForm()`.
   *
   * @param serviceParams            - Parameters for the component service (form, API URL, method, etc.).
   * @param successResponseHandler   - Callback invoked on a successful API response.
   * @param errorResponseHandler     - Optional callback invoked on an API error.
   *
   * @throws {Error} If `componentService` or `form` are not yet assigned.
   */
  protected initBase(
    serviceParams: ComponentServiceParams,
    successResponseHandler: SuccessResponseHandler,
    errorResponseHandler?: ErrorResponseHandler
  ): void {
    this.title = this.title || '';

    if (!this.componentService || !this.form) {
      throw new Error(
        'BaseAddComponent.initBase: componentService and form are required. '
        + 'Ensure the subclass calls initBase after the form is set.'
      );
    }

    this.processing$ = this.componentService.dataService.processing$;

    this.componentService.initService(serviceParams);

    this.successResponseHandler = successResponseHandler;
    this.errorResponseHandler = errorResponseHandler;

    this.prepareFormHandlers();

    this.prepareDeleteAssetsMap();

    this.initSubscribers();
  }

  /**
   * Sets up all RxJS subscriptions that drive the component's behaviour:
   * - Listens to the data service `success$` stream, invoking the success handler,
   *   showing a toast, and navigating back.
   * - Listens to the data service `error$` stream, parsing the error and showing
   *   a translated error toast.
   * - Watches the form `valueChanges` to track whether the form has been modified
   *   relative to the initial `newItem`.
   *
   * All subscriptions are automatically cleaned up via `takeUntilDestroyed`.
   */
  protected initSubscribers(): void {
    this.componentService.dataService.success$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response: any) => {
        if (!!response && response.success) {
          this.successResponseHandler(this.assetsType, response.data as T[]);

          this.appService.showSuccessToast(this.successOperationText);
          this.location.back();
        }
      });

    this.componentService.dataService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error: any) => {
        if (!!error) {
          if (this.appService.handleServerErrorResponse(error)) {
            const msg = StaticHelper.parseError(error);
            this.appService.showErrorToast(msg || 'COMMON.APP_ERROR.GENERAL');
          }
        }
      });

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formChanged = this.checkIfFormChanged());
  }

  /**
   * Builds the `handlers` map, associating each bottom‑sheet component type
   * with its corresponding result handler method.
   */
  private prepareFormHandlers(): void {
    this.handlers = new Map<Type<any>, (result: any) => void>([
      [this.IconBottomSheet, this.handleIconSelect.bind(this)],
      [this.TextBottomSheet, this.handleTitleEnter.bind(this)],
      [this.NumberBottomSheet, this.handleNumberEnter.bind(this)],
      [this.ConfirmBottomSheet, this.handleConfirm.bind(this)],
      [this.ConfirmDeleteBottomSheet, this.handleConfirmDelete.bind(this)],
      [this.ObjectListBottomSheet, this.handleObjectSelect.bind(this)]
    ]);
  }

  /**
   * Builds a map that translates asset‑type strings to their respective deletion
   * API endpoint URLs (e.g. `"CATEGORIES"` → `/api/categories/remove/{id}/{entityId}`).
   */
  private prepareDeleteAssetsMap(): void {
    this.deleteAssetsMap = new Map<string, string>([
      [this.constantsService.constantString("ASSETS_TYPE_CATEGORIES"), this.constantsService.getFullEndpointUrl("ENDPOINT_CATEGORIES_REMOVE")],
      [this.constantsService.constantString("ASSETS_TYPE_ACCOUNTS"), this.constantsService.getFullEndpointUrl("ENDPOINT_INNER_ACCOUNTS_REMOVE")],
      [this.constantsService.constantString("ASSETS_TYPE_CURRENCIES"), this.constantsService.getFullEndpointUrl("ENDPOINT_CURRENCIES_REMOVE")]
    ]);
  }

  /**
   * Prepares the form for an **add** operation:
   * 1. Creates a fresh default entity via the {@link UserAssetsFactory}.
   * 2. Populates each form control with the corresponding default value.
   * 3. Overwrites the `title` control if a title argument is provided.
   * 4. Resets the `formChanged` flag.
   *
   * @param title - Optional pre‑set title for the new entity.
   */
  public prepareForm(title?: string): void {
    this.createUserAsset();

    Object.keys(this.form.controls).forEach(key => {
      this.form.get(key)?.setValue((this.newItem as any)[key]);
    });

    if (!!title) {
      this.form.get('title')?.setValue(title);
    }

    this.formChanged = this.checkIfFormChanged();
  }

  /**
   * Prepares the form for an **edit** operation:
   * 1. Populates each form control with the current values of `newItem`.
   * 2. Overwrites the `title` control if a title argument is provided.
   * 3. Resets the `formChanged` flag.
   *
   * Unlike `prepareForm()`, this does **not** create a new entity – it preserves
   * the existing `newItem` that was already loaded by the calling context.
   *
   * @param title - Optional pre‑set title for the entity being edited.
   */
  public prepareEditForm(title?: string): void {
    Object.keys(this.form.controls).forEach(key => {
      this.form.get(key)?.setValue((this.newItem as any)[key]);
    });

    if (!!title) {
      this.form.get('title')?.setValue(title);
    }

    this.formChanged = this.checkIfFormChanged();
  }

  /**
   * Opens a bottom‑sheet component and wires up its dismiss/opened handlers.
   *
   * - Only opens if no other bottom sheet is currently visible (guarded by
   *   {@link bottomSheetIsClosed}).
   * - Cancels any previous bottom‑sheet subscriptions via {@link bottomSheetDestroy}
   *   to prevent stale handler invocations.
   * - On dismiss, looks up the component type in {@link handlers} and invokes the
   *   matching handler with the result payload.
   *
   * @param component - The Angular component class to open in the bottom sheet.
   * @param param1    - Optional first data parameter passed to the sheet.
   * @param param2    - Optional second data parameter (numeric).
   * @param param3    - Optional third data parameter (string).
   * @param title     - Optional title string passed to the sheet.
   */
  public handle(component: Type<any>, param1?: any, param2?: number, param3?: string, title?: string): void {
    if (this.bottomSheetIsClosed()) {
      const ref = this.bottomSheet.open(component, { data: { param1, param2, param3, title } });

      // Cancel any subscriptions from the previously opened bottom sheet
      this.bottomSheetDestroy.next();

      ref.afterDismissed()
        .pipe(takeUntil(this.bottomSheetDestroy))
        .subscribe((result: any | undefined) => {
          this.bottomSheetIsClosed.set(true);

          if (!!result) {
            const handler = this.handlers.get(component);
            
            if (handler) {
              handler(result);
            }
          }
        });

      ref.afterOpened()
        .pipe(takeUntil(this.bottomSheetDestroy))
        .subscribe(() => this.bottomSheetIsClosed.set(false));
    }
  }

  /**
   * Handles the result from the icon bottom‑sheet by patching the `icon` form control.
   *
   * @param icon - The selected icon object (expected to have a `title` property).
   */
  public handleIconSelect(icon: any): void {
    if (!!icon) {
      this.form.patchValue({ icon: icon.title });
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles the result from the object‑list bottom‑sheet by updating the form field
   * indicated by `object.field` with `object.value`.
   *
   * @param object - The selected `ObjectItem` containing the target field name and value.
   */
  public handleObjectSelect(object: ObjectItem): void {
    if (!!object) {
      this.form.patchValue({ [object.field]: object.value });
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles the result from the text‑input bottom‑sheet by patching the `title` form control.
   *
   * @param title - The text value entered by the user.
   */
  public handleTitleEnter(title: string): void {
    if (!!title) {
      this.form.patchValue({ title });
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles the result from the numeric‑input bottom‑sheet.
   *
   * @deprecated Not yet implemented – the method body is a placeholder.
   * @param title - The numeric value entered by the user (received as string).
   */
  public handleNumberEnter(title: string): void {
    // TOOD: To be implemented
    // think about how to pass a form field name like at the ObjectList
    // if (!!title) {
    //   this.form.patchValue({ title });
    //   this.cdr.detectChanges();
    // }
  }

  /**
   * Handles a boolean toggle result (e.g. from a switch or confirmation sheet)
   * by patching the named form field with the provided boolean value.
   *
   * @param field - The name of the form control to patch.
   * @param value - The boolean value to set.
   */
  public handleBoolean(field: string, value: boolean): void {
    if (!!field) {
      this.form.patchValue({ [field]: value });
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles a generic confirmation result. If the user confirmed, triggers a `save()`.
   *
   * @param confirm - `true` if the user confirmed, `false` otherwise.
   */
  public handleConfirm(confirm: boolean): void {
    if (confirm) {
      this.save();
    }
  }

  /**
   * Placeholder for extending components to receive a "wide text edit" value.
   * The default implementation is a no‑op; override to handle the value.
   *
   * @param value - The value produced by a wide text editor.
   * @returns The return value (if any) – unused in the base implementation.
   */
  public setTextEditWideValue(value: any): any {
    // Default no-op; subclasses should override if needed.
  }

  /**
   * Handles a delete‑confirmation result. If confirmed:
   * 1. Resolves the full delete URL from {@link deleteAssetsMap} using the current
   *    `assetsType`.
   * 2. URL‑encodes the user ID and entity ID into the endpoint template.
   * 3. Sets the data‑service method to `DELETE`.
   * 4. Sends the delete request.
   *
   * @param confirm - `true` if the user confirmed deletion.
   */
  public handleConfirmDelete(confirm: boolean): void {
    if (confirm) {
      const baseUrl = this.deleteAssetsMap.get(this.assetsType)!;
      const userId = encodeURIComponent(this.userService.user()?.id || '');
      const entityId = encodeURIComponent((this.newItem as any).id);

      this.componentService.dataService.apiUrl = baseUrl
        .replace("{id}", userId)
        .replace("{entityId}", entityId);

      this.componentService.dataService.method = this.constantsService.constantString("METHOD_DELETE");
      this.successOperationText = "COMMON.DELETED";

      this.componentService.dataService.sendData();
    }
  }

  /**
   * Creates a fresh default entity instance of the current `assetsType` using the
   * {@link UserAssetsFactory} and assigns it to {@link newItem}.
   *
   * @returns The newly created asset (value is also stored on `this.newItem`).
   */
  private createUserAsset(): any {
    this.newItem = UserAssetsFactory.CreateUserAsset(this.assetsType);
  }

  /**
   * Compares the initial values of {@link newItem} against the current form values
   * for the fields listed in {@link fieldsToCheck}.
   *
   * @returns `true` if at least one field has changed, `false` otherwise.
   */
  private checkIfFormChanged(): boolean {
    if (!this.newItem || !this.fieldsToCheck.length) {
      return false;
    }

    return this.fieldsToCheck.some(field => {
      const initial = (this.newItem as any)[field];
      const current = this.form.controls[field]?.value ?? this.form.get(field)?.value;

      return !this.areValuesEqual(initial, current);
    });
  }

  /**
   * Compares two values for equality, with special handling for numeric‑like values
   * (converted to `Number` before comparison) to avoid type‑coercion pitfalls.
   *
   * @param initial - The original value.
   * @param current - The current value.
   * @returns `true` if the values are considered equal.
   */
  private areValuesEqual(initial: any, current: any): boolean {
    const bothNumericLike = this.isNumericLike(initial) && this.isNumericLike(current);

    if (bothNumericLike) {
      return Number(initial) === Number(current);
    }

    return initial === current;
  }

  /**
   * Checks whether a value can be meaningfully compared as a number (not `null`,
   * `undefined`, empty string, or `NaN`).
   *
   * @param value - The value to test.
   * @returns `true` if the value is numeric‑like.
   */
  private isNumericLike(value: any): boolean {
    return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
  }

  /**
   * Placeholder click handler. Subclasses should override to handle clicks on the
   * component's template elements.
   *
   * @param $event - The originating DOM event.
   */
  public handleClick($event: Event): void {
    // Default no-op; subclasses should override if needed.
  }

  /**
   * Navigates to the edit page for the given item, using the route constant resolved
   * from {@link itemEditConstant}.
   *
   * @param item - The entity for which to open the edit view (must have an `id` property).
   */
  public openItem(item: any): void {
    let url = `/${this.constantsService.constantString(this.itemEditConstant)}`.replace("{itemId}", item.id);
    this.router.navigateByUrl(url);
  }

  /**
   * Validates and submits the form.
   *
   * - If the form is invalid, calls `form.showErrors()` and exits early.
   * - Builds the payload by merging the original `newItem` with the current form values
   *   (without mutating `newItem`).
   * - Sends the payload via the component service's data service.
   */
  public save(): void {
    if (this.form.invalid) {
      this.form.showErrors();
      return;
    }

    // Build payload from form values without mutating the original newItem
    // If the child class already set a custom payload (e.g. with mapped transaction
    // objects), use it instead of rebuilding from flat form values.
    const payload = this.payload || {
      ...this.newItem,
      ...Object.keys(this.form.value).reduce((acc, key) => {
        (acc as any)[key] = this.form.get(key)?.value;
        return acc;
      }, {} as Partial<T>)
    };

    this.componentService.dataService.sendData(payload);
  }

  /**
   * Navigates to the parent route. Typically invoked as a "cancel" action.
   */
  public cancel(): void {
    this.router.navigate(['../']);
  }

  /**
   * Delegates the HTTP method update to the component service.
   *
   * @param method - The HTTP method string (e.g. `"POST"`, `"PUT"`).
   */
  public updateMethod(method: string): void {
    this.componentService.updateMethod(method);
  }

  /**
   * Delegates the API URL update to the component service.
   *
   * @param url - The new API endpoint URL.
   */
  public updateApiUrl(url: string): void {
    this.componentService.updateApiUrl(url);
  }

  /**
   * Delegates a data‑send request to the component service (without a custom payload).
   * Useful when the payload has already been set internally by the service.
   */
  public sendData(): void {
    this.componentService.sendData();
  }

  /**
   * Angular lifecycle hook. Cleans up resources:
   * - Dismisses any open bottom sheet (errors are silently caught).
   * - Emits and completes the {@link bottomSheetDestroy} subject.
   * - Calls the parent `ngOnDestroy`.
   */
  public override ngOnDestroy(): void {
    try { this.bottomSheet.dismiss(); } catch (e) { /* ignore */ }
    this.bottomSheetDestroy.next();
    this.bottomSheetDestroy.complete();
    super.ngOnDestroy();
  }
}
