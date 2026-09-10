-- Marca avatares animados vindos do login social com o sufixo `#animated`.
--
-- O gate de mídia animada (GIF só para VIP) mora no upload de perfil, mas o
-- avatar do OAuth nunca passa por lá: o `auth/callback` copia a URL do
-- provedor direto para `user_profiles.avatar_url`. Como a URL do Google
-- (`lh3.googleusercontent.com/a/…=s96-c`) não tem extensão, o
-- `isAnimatedMediaUrl` do TS não tinha como reconhecê-la, e conta comum
-- ficava com foto de perfil animada.
--
-- O fragmento `#animated` é ignorado por servidor HTTP e por `next/image`
-- (a imagem carrega exatamente igual), então serve como marca persistente
-- sem tocar no arquivo nem depender de uma coluna nova. A partir daqui
-- `resolveProfileMedia` devolve `needsFreeze` e o avatar é desenhado como
-- quadro único num canvas — sem destruir nada: se a conta virar VIP, o GIF
-- volta a animar sozinho.
--
-- Os dois ids abaixo foram confirmados um a um baixando o arquivo e contando
-- os blocos de controle gráfico (75 e 164 quadros — animados de verdade).
-- Novos cadastros são cobertos por `markAnimatedOAuthAvatar`, no callback.

-- Marcação por URL exata: evita depender de ids fixos e é idempotente
-- (o `not like` impede marcar duas vezes se a migration reexecutar).
update user_profiles
set avatar_url = avatar_url || '#animated'
where avatar_url like 'https://lh3.googleusercontent.com/a/ACg8ocKAhei2CHgtkZljUJ72YnbBlH_RgSG2UivUrbLUj4BfzS7ERQCe3Q=s96-c%'
  and avatar_url not like '%#animated';

update user_profiles
set avatar_url = avatar_url || '#animated'
where avatar_url like 'https://lh3.googleusercontent.com/a/ACg8ocKxFEPfYYLYHekp0cyCrN_denaCrSFE72Nx19wWJzVMYb2lSTsh=s96-c%'
  and avatar_url not like '%#animated';
