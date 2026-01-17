export type InventoryVariant = {
  id: string;
  condition: string | null;
  barcode: string | null;
  cost: number | null;
  price: number | null;
  qty: number | null;
  ship_class: string | null;
  issue_notes: string | null;
  created_at: string | null;
};

export type InventoryProduct = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean | null;
  created_at: string | null;
  product_variants: InventoryVariant[] | null;
};
