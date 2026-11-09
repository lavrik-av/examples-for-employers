import {
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { NavigationBarBackComponent } from '@core/ui/components/navigation-bar-back/navigation-bar-back.component';
import { TmSubmitFlatButtonComponent } from '@core/ui/components/buttons/tm-submit-flat-button/tm-submit-flat-button.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SHARED_MATERIAL_ICON_BUTTON_INPUT } from '@core/shared-modules/material-modules-icon-button-input';
import { TextEditComponent } from '@core/ui/components/text-edit/text-edit.component';
import { componentServiceProvider } from '@core/providers/componentServiceProvider';
import { TitleSlideToggleComponent } from '@core/ui/components/title-slide-toggle/title-slide-toggle.component';
import { TextEditWideComponent } from '@core/ui/components/text-edit-wide/text-edit-wide.component';
import { BaseItemUiComponent } from '../BaseItemUiComponent';
import { IBaseItemUiComponent } from '@core/interfaces/BaseComponent/IBaseItemUiComponent';
import { formProvider } from '@core/providers/form-provider';
import { CategoryFormGroup } from '@views/user/settings/categories/ui/form/CategoryFormGroup';

@Component({
  selector: 'app-add',
  standalone: true,
  providers: [
    componentServiceProvider,
    formProvider(CategoryFormGroup)
  ],
  imports: [
    ReactiveFormsModule,
    CommonModule,
    TranslateModule,
    NavigationBarBackComponent,
    TmSubmitFlatButtonComponent,
    MatBottomSheetModule,
    MatFormFieldModule,
    SHARED_MATERIAL_ICON_BUTTON_INPUT,
    TextEditComponent,
    TitleSlideToggleComponent,
    TextEditWideComponent,
  ],
  templateUrl: './add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { component: 'add-category-admin' },
})
/** Component for adding a new category or subcategory in the admin panel. */
export class AddComponent extends BaseItemUiComponent implements IBaseItemUiComponent
{
  constructor() {
    super();
  }

  /** Initializes the component: sets API URL, vars, and prepares the form. */
  public override ngOnInit(): void {
    super.ngOnInit();

    super.updateApiUrl(
      this.constantsService
        .getFullEndpointUrl('ENDPOINT_ADMIN_CATEGORY_ADD')
        .replace('{id}', this.userService?.user()?.id || ''),
    );

    this.initItemComponentVars();

    this.prepareItemComponent();
  }

  /** Sets the page title for the add category view. */
  public initItemComponentVars(): void {
    this.title = 'SETTINGS.ADD_CATEGORY';
  }

  /** Prepares the component form. */
  public prepareItemComponent(): void {
    this.prepareComponentForm();
  }

  /** Configures the add form with default values, handling both category and subcategory setup. */
  public override prepareComponentForm(): void {
    let newCategoryTitle = this.translateService.instant(
      'SETTINGS.NEW_CATEGORY_TITLE',
    );

    super.prepareForm(newCategoryTitle);
    this.form.get('system')?.setValue(true);
    this.form.get('parentId')?.setValue(null);

    if (this.subcategory()) {
      newCategoryTitle = this.translateService.instant(
        'SETTINGS.NEW_SUBCATEGORY_TITLE',
      );

      this.parentCategory = this.getParentCategory(this.parentId());

      if (!!this.parentCategory) {
        this.form.get('parentId')?.setValue(this.parentId());
        this.form.get('type')?.setValue(this.parentCategory.type);
        this.form.get('active')?.setValue(this.parentCategory.active);

        this.title = this.parentCategory.title;
      }
    }
  }
}
