-- Fix: Habilita permissão 'peripherals_write' para todos os admins
-- Execute isto no Supabase SQL Editor para que os admins consigam criar/editar periféricos

UPDATE public.admin_profiles
SET permissions = jsonb_set(permissions, '{peripherals_write}', 'true'::jsonb)
WHERE permissions ? 'peripherals_write';

-- Verificar se funcionou:
-- SELECT id, email, role, permissions -> 'peripherals_write' as peripherals_write FROM public.admin_profiles;
