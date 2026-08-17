-- Identidade visual por variante: cor (swatch), ícone (nome lucide, lista
-- fechada mapeada em lib/variant-icons.ts) e uma imagem específica da
-- variante (mostrada no carrinho e, se selecionada, no carrossel do produto
-- em vez da imagem principal — não usada no círculo da variante em si).
alter table public.store_product_variants
  add column if not exists color      text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists icon       text check (icon is null or char_length(icon) <= 40),
  add column if not exists image_url  text check (image_url is null or char_length(image_url) <= 2048);
