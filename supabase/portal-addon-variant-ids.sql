-- Lilac Desk order portal: Shopify add-on variant IDs
-- Run once in Supabase SQL Editor, AFTER portal-schema.sql.

update public.addons set personal_variant_id = 50715216118017, commercial_variant_id = 50715216150785 where key = 'rush';
update public.addons set personal_variant_id = 50715216183553, commercial_variant_id = 50715216216321 where key = 'extra_pages';
update public.addons set personal_variant_id = 50715216281857, commercial_variant_id = 50715216314625 where key = 'extra_template';
update public.addons set personal_variant_id = 50715216347393, commercial_variant_id = 50715216380161 where key = 'extra_revision';
update public.addons set personal_variant_id = 50715216445697, commercial_variant_id = 50715216478465 where key = 'sticker_set';
update public.addons set personal_variant_id = 50715216511233, commercial_variant_id = 50715216544001 where key = 'sticker_both';
update public.addons set personal_variant_id = 50715216609537, commercial_variant_id = 50715216642305 where key = 'notebook';
update public.addons set personal_variant_id = 50715216675073, commercial_variant_id = 50715216707841 where key = 'journal';
update public.addons set personal_variant_id = 50715216773377, commercial_variant_id = 50715216806145 where key = 'link_pack';
update public.addons set personal_variant_id = 50715216838913, commercial_variant_id = 50715216871681 where key = 'calendar_links';
update public.addons set personal_variant_id = 50715216937217, commercial_variant_id = 50715216969985 where key = 'colorway';
update public.addons set personal_variant_id = 50715217002753, commercial_variant_id = 50715217035521 where key = 'undated_version';
update public.addons set personal_variant_id = 50715217101057, commercial_variant_id = 50715217133825 where key = 'additional_year';
update public.addons set personal_variant_id = 50715217166593, commercial_variant_id = 50715217199361 where key = 'both_orientations';
update public.addons set personal_variant_id = 50715217232129, commercial_variant_id = 50715217264897 where key = 'important_dates';
update public.addons set commercial_variant_id = 50715217330433 where key = 'mockups';
update public.addons set commercial_variant_id = 50715217363201 where key = 'listing_copy';
update public.addons set commercial_variant_id = 50715217428737 where key = 'cover_variations';
update public.addons set commercial_variant_id = 50715217461505 where key = 'freebie';
update public.addons set commercial_variant_id = 50715217527041 where key = 'personalized_copies';
update public.addons set commercial_variant_id = 50715217559809 where key = 'source_files_basic';
update public.addons set commercial_variant_id = 50715217592577 where key = 'source_files_standard';
update public.addons set commercial_variant_id = 50715217625345 where key = 'source_files_premium';

-- Check: every row should show at least one ID
select key, personal_variant_id, commercial_variant_id from public.addons order by sort;
