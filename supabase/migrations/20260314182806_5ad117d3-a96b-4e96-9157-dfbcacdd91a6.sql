-- Ajusta políticas de UPDATE em paver_profiles para permitir edição segura de nomes por admin
DROP POLICY IF EXISTS "Users can update own profile" ON public.paver_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.paver_profiles;

CREATE POLICY "Users can update own profile"
ON public.paver_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
ON public.paver_profiles
FOR UPDATE
TO authenticated
USING (public.paver_has_role(auth.uid(), 'admin'))
WITH CHECK (public.paver_has_role(auth.uid(), 'admin'));