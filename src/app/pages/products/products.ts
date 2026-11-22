import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n';
import { PageMenu } from '../../shared/title-fan';

/**
 * Product history (Gianni: «Historial de productos», the products viewed). For now an empty screen in the menu, in the
 * look of the other pages; its data is connected later, so nothing is read or stored here yet.
 */
@Component({
  selector: 'app-products',
  template: `
    <section class="products-page">
      <header class="board-top products-top">
        <h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')"
                    (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('products.title') }}<span class="title-chev" aria-hidden="true">⌄</span></button></h1>
      </header>
      <div class="products-empty">
        <!-- a clock turning back over a list: the history to come -->
        <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/>
        </svg>
        <p class="products-lead">{{ i18n.t('products.empty') }}</p>
        <p class="muted">{{ i18n.t('products.soon') }}</p>
      </div>
    </section>
  `,
})
export class Products {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
}
