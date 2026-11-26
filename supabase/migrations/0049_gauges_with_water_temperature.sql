-- River gauges: the New Jersey stream gauges that measure water temperature as well as flow.
--
-- Of the thirteen gauges the list started with (0048), USGS measures water temperature at
-- one — the Raritan at Manville. These nineteen are every other stream gauge in the state
-- that was reporting both flow and water temperature when this was written (November 2026),
-- so the page's "Water temp" view has something to chart. Station numbers and place names
-- are the U.S. Geological Survey's, as public as data gets.
--
-- Left out on purpose: six gauges that measure temperature but not flow (the page's closed
-- rows are about flow, and a gauge with none reads as not reporting), and the Delaware and
-- Raritan Canal feeder at Washington Crossing, which is a gate on a canal rather than a
-- river and was reading 0 cfs.
--
-- They follow the first thirteen in the club's order — the trout water nearest those rivers
-- first, then down the state — and ahead of anything a member has added. A gauge a member
-- already added keeps the name and the place in the list that member gave it.

do $$
declare
  added integer;
  offered constant integer := 19;
begin
  insert into public.river_gauges (site_no, river, place, state, position) values
    ('01445500', 'Pequest River',                 'at Pequest',                        'NJ', 20),
    ('01455290', 'Pohatcong Creek',               'at Creek Road near Carpentersville', 'NJ', 21),
    ('01457500', 'Delaware River',                'at Riegelsville',                   'NJ', 22),
    ('01463500', 'Delaware River',                'at Trenton',                        'NJ', 23),
    ('01388000', 'Ramapo River',                  'at Pompton Lakes',                  'NJ', 24),
    ('01381800', 'Whippany River',                'near Pine Brook',                   'NJ', 25),
    ('01379530', 'Canoe Brook',                   'near Summit',                       'NJ', 26),
    ('01402000', 'Millstone River',               'at Blackwells Mills',               'NJ', 27),
    ('01408029', 'Manasquan River',               'near Allenwood',                    'NJ', 28),
    ('01464500', 'Crosswicks Creek',              'at Extonville',                     'NJ', 29),
    ('01464290', 'Crosswicks Creek',              'at Hockamik Road near Cookstown',   'NJ', 30),
    ('01467000', 'North Branch Rancocas Creek',   'at Pemberton',                      'NJ', 31),
    ('01466900', 'Greenwood Branch',              'at New Lisbon',                     'NJ', 32),
    ('01466500', 'McDonalds Branch',              'in Byrne State Forest',             'NJ', 33),
    ('01467081', 'South Branch Pennsauken Creek', 'at Cherry Hill',                    'NJ', 34),
    ('01467150', 'Cooper River',                  'at Haddonfield',                    'NJ', 35),
    ('01477120', 'Raccoon Creek',                 'near Swedesboro',                   'NJ', 36),
    ('01477070', 'Raccoon Creek',                 'at Wrights Mill',                   'NJ', 37),
    ('01412080', 'Manumuskin River',              'at Cumberland',                     'NJ', 38)
  on conflict (site_no) do nothing;
  get diagnostics added = row_count;
  -- (A count, never a name: the deploy log is public.)
  if added > 0 then
    raise notice 'river gauges: % gauge(s) that measure water temperature added (% were on the list already)', added, offered - added;
  end if;
end $$;
