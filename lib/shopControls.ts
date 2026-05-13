export type ShopControls = {
  showPrices: boolean;
  allowAddToCart: boolean;
  allowCheckout: boolean;
};

export const SHOP_ADD_TO_CART_DISABLED_MESSAGE =
  "Adding to cart is temporarily unavailable.";
export const SHOP_CHECKOUT_DISABLED_MESSAGE =
  "Checkout is temporarily unavailable right now.";
export const SHOP_PRICE_HIDDEN_LABEL = "Hidden by admin";

export function resolveShopControls(
  input:
    | {
        show_prices?: boolean | null;
        allow_add_to_cart?: boolean | null;
        allow_checkout?: boolean | null;
        showPrices?: boolean | null;
        allowAddToCart?: boolean | null;
        allowCheckout?: boolean | null;
      }
    | null
    | undefined
): ShopControls {
  return {
    showPrices:
      input?.show_prices ?? input?.showPrices ?? true,
    allowAddToCart:
      input?.allow_add_to_cart ?? input?.allowAddToCart ?? true,
    allowCheckout:
      input?.allow_checkout ?? input?.allowCheckout ?? true,
  };
}
