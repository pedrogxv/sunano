# Admin Area - Supabase Setup Guide

## Descrição

A área administrativa permite gerenciar a tierlist de periféricos com persistência em banco de dados via Supabase. Você pode:

- **Criar periféricos**: Adicionar novos periféricos com nome, marca, preço, imagem e especificações
- **Editar periféricos**: Modificar informações existentes
- **Deletar periféricos**: Remover periféricos da lista
- **Upload de imagens**: Armazenar imagens no Supabase Storage
- **Gerenciar tags e specs**: Adicionar características específicas por categoria

## Configuração do Supabase

### 1. Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Clique em "New Project"
3. Preencha:
   - **Project Name**: `sunano-tierlist`
   - **Database Password**: Salve em local seguro
   - **Region**: Escolha próximo a você
4. Aguarde a criação (~2 min)

### 2. Configurar Tabela `peripherals`

1. No Supabase Dashboard, vá para **SQL Editor**
2. Clique em **New Query**
3. Cole o SQL abaixo e execute:

```sql
-- Criar tabela peripherals
CREATE TABLE IF NOT EXISTS peripherals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('keyboard', 'mouse', 'mousepad', 'glasspad', 'iem', 'headset')),
  tier TEXT NOT NULL CHECK (tier IN ('GOAT', 'SS', 'S', 'A', 'B', 'C', 'L')),
  price DECIMAL NOT NULL,
  image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  specs JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_peripherals_category ON peripherals(category);
CREATE INDEX IF NOT EXISTS idx_peripherals_tier ON peripherals(tier);
```

### 3. Configurar Storage Bucket

1. No Supabase Dashboard, vá para **Storage**
2. Clique em **Create New Bucket**
3. Nome: `peripherals`
4. Selecione **Public bucket** (para servir imagens publicamente)
5. Clique em **Create Bucket**

### 4. Configurar RLS (Row Level Security)

1. No **SQL Editor**, execute:

```sql
-- Copie e cole o conteúdo de [supabase/security.sql](supabase/security.sql)
```

### 5. Configurar Storage Policies

1. Vá para **Storage > peripherals**
2. Clique em **Policies**
3. Crie duas políticas:

**Política de Leitura:**
```
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'peripherals');
```

**Política de Upload:**
```
CREATE POLICY "Authenticated upload access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'peripherals');
```



### 6. Obter Credenciais

1. Vá para **Project Settings > API**
2. Copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> A `anon` key é pública por design e pode ir para o navegador.
> Nunca coloque a `service_role` key em código client-side ou em arquivos `NEXT_PUBLIC_*`.

### 7. Configurar .env.local

No projeto, edite `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-chave-anonima
```

## Acessar Admin

1. Inicie o projeto: `npm run dev`
2. Acesse: `http://localhost:3000/admin`
3. Dashboard com links para:
   - Gerenciar Periféricos
   - Classificações (Tiers)
   - Configurações

## Funcionalidades

### Criar Periférico

1. Clique em "Novo Periférico"
2. Preencha:
   - **Nome**: Ex: "Logitech G Pro X Superlight 2"
   - **Marca**: Ex: "Logitech"
   - **Preço**: Valor em dólares
   - **Categoria**: Teclado, Mouse, Mousepad, etc
  - **Tier**: GOAT, SS, S, A, B, C, L
   - **Tags**: Competitive, Bomba, Value, Comfort
   - **Imagem**: Upload de arquivo
   - **Specs**: Campos específicos por categoria

### Especificações por Categoria

**Mouse:**
- Mouse Shape (symmetrical/ergonomic)
- Driver (HERO 2, PMW 3389, etc)
- Connectivity (wired/wireless)
- Size (small/medium/large)

**Teclado:**
- Layout (60%, 75%, TKL, Full-size)
- Profile (Rapid Trigger, Magnético, etc)
- Connectivity (wired/wireless)

**Mousepad:**
- Surface (cloth/hybrid/glass)
- Profile (Control/Speed)

## API Supabase

Você pode usar a API Supabase diretamente:

```typescript
import { supabase } from '@/lib/supabase'

// Listar
const { data } = await supabase
  .from('peripherals')
  .select('*')

// Inserir
const { data, error } = await supabase
  .from('peripherals')
  .insert([{ name: 'Mouse', ... }])

// Upload Imagem
const { error } = await supabase.storage
  .from('peripherals')
  .upload(`filename.jpg`, file)
```

## Troubleshooting

**Erro: "Cannot read properties of undefined"**
- Verifique as variáveis de ambiente em `.env.local`
- Confirme que Supabase URL e API key estão corretos

**Imagens não aparecem**
- Verifique se o bucket "peripherals" existe
- Confirme que o bucket está como "Public"

**Inserção falha**
- Verifique RLS policies estão ativadas
- Confirme que os valores correspondem aos CHECK constraints

## Próximos Passos (Avançado)

1. **Autenticação**: Implementar login para admin
2. **Backup automático**: Configurar backups no Supabase
3. **Histórico**: Rastrear mudanças com audit log
4. **Cache**: Implementar revalidação de cache Next.js
