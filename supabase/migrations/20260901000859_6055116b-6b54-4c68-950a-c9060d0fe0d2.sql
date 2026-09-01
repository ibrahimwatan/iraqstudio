CREATE POLICY "members view product images" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'product-images');

CREATE POLICY "merchants upload own product images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "merchants delete own product images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'product-images'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );