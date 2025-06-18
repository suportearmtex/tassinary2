/*
  # Atualizar esquema de serviços e políticas

  1. Alterações
    - Alterar tipo da coluna `duration` de interval para integer
    - Adicionar política de DELETE para appointments
    - Converter dados existentes de duration para minutos

  2. Segurança
    - Adicionar política para permitir que usuários autenticados excluam agendamentos
*/

-- Converter a coluna duration para integer (minutos)
ALTER TABLE services
ALTER COLUMN duration TYPE integer
USING EXTRACT(epoch FROM duration) / 60;

-- Adicionar política de DELETE para appointments
CREATE POLICY "Allow authenticated users to delete appointments"
ON appointments
FOR DELETE
TO authenticated
USING (true);