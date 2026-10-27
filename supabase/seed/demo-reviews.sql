-- Demo reviews for presentations.
--
-- Generates 7 to 14 Tagalog demo reviews for every active product (about 800 in all).
-- Deterministic: the fixed seed gives the same set every time it runs.
--
-- Every row is is_demo = true: no order and no buyer behind it, so sales, stock and
-- "sold" counts never change. They show only while Admin > Settings > Demo content is on,
-- each tagged "Sample", never count as verified, and are never sent to search engines.
--
-- Re-running replaces the previous demo set; real reviews are never touched.
-- Remove them all from Admin > Settings > Remove demo content.
--
-- Requires migration 20261029000000_reviews_replies_moderation_demo.sql.

begin;

delete from public.reviews where is_demo;

do $$
declare
  v_end timestamptz := '2026-10-26 20:00:00+00';

  v_names text[] := array[
    'Andrea Reyes', 'Paolo Mendoza', 'Kimberly Dizon', 'Jasmine Torres', 'Carlo Bautista', 'Lea Villanueva',
    'Miguel Santos', 'Angelica Cruz', 'Joshua Ramos', 'Bea Garcia', 'Mark Aquino', 'Trisha Navarro',
    'Kevin Castillo', 'Nicole Fernandez', 'Ryan Gonzales', 'Camille Rivera', 'Jerome Flores', 'Patricia Lim',
    'Ivan Domingo', 'Rhea Marquez', 'Christian Salazar', 'Denise Aguilar', 'Paul Tolentino', 'Hazel Pascual',
    'Gab Manalo', 'Shane Robles', 'Jessa Ocampo', 'Renz Velasco', 'Mae Soriano', 'Arvin De Leon',
    'Kyla Mercado', 'Jun Cabrera', 'Ella Valdez', 'Bryan Sison', 'Faith Lopez', 'Nathan Uy',
    'Joanna Lacson', 'Marvin Dela Cruz', 'Kristine Abad', 'Lance Ilagan', 'Sofia Bernardo', 'Dominic Yap'
  ];

  -- Fits any product; mixed into every product's pool.
  v_generic text[] := array[
    'Sulit na sulit sa presyo. Babalik ako ulit dito.',
    'Maayos ang pagkaka-pack at may kasamang thank you note pa. Ang bait ni seller!',
    'Mabilis ang shipping, tatlong araw lang nasa bahay na.',
    'Tama ang item na dumating, walang sira. Highly recommended!',
    'Pangalawang order ko na ito, hindi pa rin ako nadidismaya.',
    'Ang bilis mag-reply ni seller sa tanong ko tungkol sa sukat. Salamat po!',
    'Maganda ang quality para sa presyo. Ipinagmalaki ko pa sa mga kaibigan ko.',
    'Regalo ko ito sa asawa ko, nagustuhan niya talaga.',
    'Same na same sa picture. Walang halong daya.',
    'Na-receive ko nang maayos at malinis. Five stars!',
    'Sobrang satisfied ako. Siguradong oorder ulit.',
    'Okay na okay! Maayos din ang COD, walang naging problema.',
    'Bumili ako para sa kapatid ko, sakto sa kanya. Salamat, RobertJ!',
    'Worth it ang paghihintay. Maganda talaga sa personal.'
  ];

  v_okay text[] := array[
    'Okay naman ang tela pero medyo maluwag sa akin. Mag-size down siguro ako sa susunod.',
    'Maayos ang quality pero medyo iba ang kulay sa picture, mas maputla nang konti.',
    'Pwede na para sa presyo. Medyo natagalan lang ang delivery, mga limang araw.',
    'Maganda sana pero may konting sinulid na nakalabas. Ginupit ko na lang.',
    'Okay lang. Medyo manipis ang tela kaysa sa inaasahan ko pero komportable naman.',
    'Maganda ang design pero medyo mahaba sa akin. Ipapa-adjust ko na lang.',
    'Ayos naman, kaso medyo matagal bago na-ship. Pero maayos ang pagkaka-pack.',
    'Ayos lang ang tela pero medyo kumupas nang konti pagkalaba.',
    'Mas maliit nang konti sa inaasahan ko, pero pwede na.'
  ];
  v_okay_topic text[] := array['size', 'color', 'delivery', 'thread', 'fabric', 'size', 'delivery', 'fabric', 'size'];

  v_bad2 text[] := array[
    'Medyo maliit ang sukat kumpara sa size chart. Sana mas malinaw ang sukat sa listing.',
    'Natagalan ang delivery at medyo gusot pagdating. Okay naman ang tela.',
    'Masikip sa bewang kahit tama ang size na in-order ko. Sayang, ganda pa naman ng kulay.',
    'May maliit na mantsa sa likod pagdating. Natanggal naman sa laba pero sana na-check muna.'
  ];
  v_bad2_topic text[] := array['size', 'delivery', 'size', 'thread'];

  v_bad1 text[] := array[
    'Iba ang kulay na dumating sa in-order ko. Sana mas maingat sa pag-check bago ipadala.',
    'Natastas ang tahi sa gilid pagkalaba pa lang ng isang beses.',
    'Hindi ito ang size na in-order ko. Kinailangan ko pang ibalik.'
  ];
  v_bad1_topic text[] := array['color', 'thread', 'size'];

  v_thanks text[] := array[
    'Maraming salamat po sa magandang review, {first}! Abangan niyo po ang bago naming designs.',
    'Salamat po sa tiwala, {first}! Sana makabili po ulit kayo sa amin.',
    'Salamat po, {first}! Masaya kaming nagustuhan niyo. Ingat po palagi!'
  ];

  p record;
  v_kind text;
  v_pool text[];
  v_used text[];
  v_avail text[];
  v_pick text[];
  v_texts text[];
  v_topics text[];
  v_idx int[];
  v_n int;
  v_i int;
  v_k int;
  v_r double precision;
  v_rating int;
  v_comment text;
  v_topic text;
  v_color text;
  v_size text;
  v_name text;
  v_first text;
  v_reply text;
  v_start timestamptz;
  v_created timestamptz;
  v_replied timestamptz;
begin
  perform setseed(0.2026);

  for p in
    select
      pr.id,
      lower(pr.title) as t,
      pr.created_at,
      (select array_agg(distinct v.color order by v.color) from public.product_variants v
         where v.product_id = pr.id and v.status = 'active' and v.color is not null) as colors,
      (select array_agg(distinct v.size order by v.size) from public.product_variants v
         where v.product_id = pr.id and v.status = 'active' and v.size is not null) as sizes
    from public.products pr
    where pr.status = 'active'
    order by pr.created_at, pr.id
  loop
    v_kind := case
      when p.t like '%jacket%' then 'jacket'
      when p.t like '%oxford%' or (p.t like '%shirt%' and p.t not like '%short%') then 'shirt'
      when p.t like '%tote%' then 'tote'
      when p.t like '%trouser%' then 'trousers'
      when p.t like '%skirt%' then 'skirt'
      when p.t like '%chino%' then 'chino'
      when p.t like '%taslan%' or p.t like '%running%' then 'running'
      when p.t like '%jersey%' or p.t like '%nba%' or p.t like '%drifit%' then 'jersey'
      when p.t like '%semi formal%' or p.t like '%jacquard%' or p.t like '%tailored%' or p.t like '%textured%' then 'semiformal'
      else 'casual'
    end;

    v_pool := (case v_kind
      when 'jersey' then array[
        'Ang ganda ng tela, presko sa katawan. Sakto pang-basketball tuwing hapon.',
        'Legit na drifit, hindi mainit isuot. Bibili ulit ako ng ibang team.',
        'Mabilis dumating at maayos ang pagkaka-pack. Tama ang kulay sa picture.',
        'Sulit sa presyo! Hindi kumupas kahit ilang beses ko nang nalabhan.',
        'Ginamit ko agad sa liga namin, komportable at hindi lumuluwag ang garter.',
        'Pinabili ko para sa anak ko, tuwang-tuwa siya. Matibay ang tahi.',
        'Ganda ng print ng logo, hindi nagbabakbak. Pang-araw-araw ko na ito.',
        'Bagay na bagay pang-pickup game sa court namin.',
        'Hindi madaling mag-fade ang kulay ng team, ilang laba na.',
        'Malambot ang tela at hindi makati sa balat.',
        'Pinang-uniform namin sa barangay liga, pare-pareho ang kulay. Ayos!',
        'Medyo malaki ang fit pero gusto ko ganito pang-laro.',
        'May bulsa sa gilid, hindi na mahuhulog ang cellphone ko.',
        'Sakto ang haba sa tuhod, hindi nakakasagabal sa pagtakbo.']
      when 'running' then array[
        'Magaan at mabilis matuyo, ginamit ko agad sa jogging. Recommended!',
        'Hindi mainit kahit tanghali tumakbo. May bulsa pa, ang galing.',
        'Maganda ang print, mas maganda pa sa personal. Sakto ang garter.',
        'Presko at hindi kumakapit sa balat kapag pinagpapawisan. Sulit!',
        'Pang-gym at pang-takbo, swak na swak. Mag-o-order ulit ako.',
        'Ginamit ko sa fun run, hindi ako nahirapan kahit mainit.',
        'Ang ganda ng kulay, kita agad kahit gabi tumakbo.',
        'Mabilis matuyo pagkalaba, perfect sa araw-araw na takbo.',
        'Hindi kumikiskis sa hita kahit malayo ang takbo.',
        'Light lang sa katawan, parang walang suot.',
        'May inner lining kaya komportable. Sulit!',
        'Bumili ako ng dalawa, isa pang-gym at isa pang-jogging.',
        'Hindi nangangati kahit pawisan. Recommended sa mga runner.']
      when 'semiformal' then array[
        'Pang-office look pero shorts, ang ganda ng texture ng tela. Bagay sa polo.',
        'Maayos ang tahi at hindi manipis. Ginamit ko sa lakad namin, maraming nag-compliment.',
        'Sakto ang fit sa bewang at hindi masikip sa hita. Mukhang mamahalin.',
        'Ang ganda ng tela, may konting stretch. Worth it sa presyo.',
        'Pwede sa simbahan at sa mall, malinis tingnan. Maayos ang pagkaka-plantsa pagdating.',
        'Hindi mukhang mura, parang galing mall. Sulit!',
        'Bagay sa loafers at polo, pang-date night.',
        'Hindi madaling malukot kahit maghapon kong suot.',
        'Ang ganda ng texture, may pagka-formal pero komportable.',
        'Ginamit ko sa company outing, maraming nagtanong kung saan ko nabili.',
        'Sakto ang haba, nasa itaas lang ng tuhod.',
        'Makapal pero hindi mainit. Paborito ko na.',
        'Malinis ang tahi sa bulsa at butones.']
      when 'skirt' then array[
        'Ang cute! Sakto ang haba, hindi masyadong maikli. Komportable isuot.',
        'Maganda ang tela at hindi bakat kahit maliwanag. Babalikan ko si seller.',
        'Bagay sa crop top at sneakers. Mabilis dumating, maayos ang pack.',
        'May shorts sa loob kaya panatag gumalaw. Ang ganda ng bagsak ng palda.',
        'Hindi madaling malukot, pwede agad isuot pagkahango sa sampayan.',
        'Ang flowy tingnan, bagay sa picture-taking.',
        'Sakto sa bewang ko, hindi lumuluwag.',
        'Isinuot ko sa birthday ng kaibigan ko, ang daming nag-compliment.',
        'Maganda ang kulay at hindi manipis ang tela.',
        'Pwede pang-school at pang-gala. Babalik ako para sa ibang kulay.',
        'Ang ganda ng pleats, hindi nawawala kahit nalabhan na.',
        'Komportable gumalaw, hindi kailangang mag-ingat sa pag-upo.']
      when 'trousers' then array[
        'Presko ang tela, bagay sa mainit na panahon. Maayos ang plantsa pagdating.',
        'Pormal tingnan, pwede sa office at sa kasal. Sakto ang haba.',
        'Ang ganda ng bagsak ng tela. Medyo mahal pero sulit sa kalidad.',
        'Maayos ang tahi at hindi madaling malukot. Paborito ko na itong pang-office.',
        'Bagay sa leather shoes, mukhang malinis at maayos.',
        'Hindi makati ang tela kahit buong araw sa opisina.',
        'Sakto ang bewang, hindi na kailangan ng sinturon.',
        'Ginamit ko sa interview, confident ako buong araw.',
        'Madaling plantsahin at hindi agad nalulukot.',
        'Maganda ang bagsak sa sapatos, tamang-tama ang haba.',
        'Mahal nang konti pero ramdam mo ang quality.']
      when 'jacket' then array[
        'Makapal at mainit, perfect sa Baguio trip namin. Ang ganda ng kulay ng denim.',
        'Matibay ang tahi at butones. Mukhang branded, sulit ang bayad.',
        'Ang lambot sa loob at hindi makati. Sakto ang sukat sa balikat.',
        'Pang-porma talaga. Maraming nagtanong kung saan ko nabili.',
        'Matibay ang zipper at butones, hindi basta-basta masisira.',
        'Sakto sa malamig na panahon, lalo na sa umaga.',
        'Bagay sa kahit anong t-shirt. Paborito ko nang pang-alis.',
        'Makapal pero hindi mabigat isuot.',
        'Ganda ng wash ng denim, parang vintage talaga.',
        'Sinuot ko sa Tagaytay, hindi ako nilamig.',
        'Maayos ang tahi sa loob, walang sinulid na nakalabas.']
      when 'shirt' then array[
        'Maganda ang tela, hindi madaling malukot. Pang-office ko na ito araw-araw.',
        'Sakto ang fit at hindi maluwag sa balikat. Malinis ang tahi ng kwelyo.',
        'Presko isuot kahit buong araw sa labas. Sulit sa presyo.',
        'Hindi naninilaw ang kwelyo kahit madalas gamitin.',
        'Madaling plantsahin at maganda ang bagsak.',
        'Sakto ang haba ng manggas, hindi bitin.',
        'Bagay pang-office at pang-simba.',
        'Malambot ang tela, hindi mainit kahit tanghali.',
        'Kumpleto ang butones at may extra pa.',
        'Mukhang mamahalin pero abot-kaya.']
      when 'tote' then array[
        'Matibay at malaki, kasya ang laptop at baon ko. Ang cute ng design.',
        'Makapal ang tela, hindi agad mapupunit. Gamit ko na rin pang-palengke.',
        'Ang ganda ng tahi sa hawakan, hindi bumibigay kahit mabigat ang laman.',
        'Ang dami ng kasya! Pang-school at pang-grocery.',
        'May bulsa sa loob para sa susi at wallet. Ang galing.',
        'Matibay ang hawakan kahit ilagay ang mabibigat na libro.',
        'Simple pero ang ganda ng design, bagay sa kahit anong suot.',
        'Nilabhan ko na, hindi kumupas ang print.',
        'Regalo ko sa nanay ko, tuwang-tuwa siya.',
        'Eco bag na pang-porma pa. Sulit!']
      when 'chino' then array[
        'Sakto ang fit ng size {size}, hindi masikip. Maganda ang kulay na {color}.',
        'Makapal ang tela pero presko. Pwede pang-casual at pang-lakad.',
        'Ang linis ng tahi at tama ang haba sa tuhod. Bagay sa polo shirt.',
        'Bumili ako ng {color} at babalik ako para sa ibang kulay. Sulit!',
        'Sakto sa bewang at hindi masikip sa hita. Bagay pang-weekend.',
        'Hindi madaling malukot, pwede agad isuot.',
        'Ang ganda ng kulay na {color}, hindi kupas sa laba.',
        'May stretch nang konti kaya komportable umupo.',
        'Size {size} ang kinuha ko, tama lang sa akin.',
        'Malinis ang tahi sa bulsa at sa laylayan.',
        'Pang-lakad at pang-office casual, pasok na pasok.']
      else array[
        'Ang lambot ng tela, perfect pambahay at pang-lakad. Sulit na sulit.',
        'Tama ang sukat, hindi bitin. Maganda ang kulay at hindi kupas.',
        'Komportable isuot buong araw. Mag-o-order ulit ako ng ibang kulay.',
        'Mura pero maganda ang quality. Maayos din ang packaging ni seller.',
        'Ganda pang-summer, presko at magaan. Salamat po, seller!',
        'Mabilis ang delivery, dalawang araw lang nandito na. Okay na okay ang fit.',
        'Pang-tambay at pang-tulog, ang presko. Bumili ako ng tatlo para sa buong pamilya.',
        'Pang-bahay na pang-alis pa, ang versatile.',
        'Malambot at hindi mainit, sakto sa panahon ngayon.',
        'Hindi masikip ang garter, komportable kahit buong araw.',
        'Ang ganda ng kulay, mas maganda pa sa picture.',
        'Hindi nagbago ang hugis kahit ilang beses nang nalabhan.',
        'Swak sa budget at maganda pa ang tahi.',
        'Ginagamit ko pang-tulog, ang presko sa gabi.']
    end) || v_generic;

    v_n := 7 + floor(random() * 8)::int;  -- 7 to 14
    select array_agg(x order by random()) into v_pick from unnest(v_names) as x;
    v_used := '{}';
    v_start := greatest(p.created_at + interval '2 days', v_end - interval '90 days');

    for v_i in 1..v_n loop
      v_name := v_pick[v_i];
      v_first := split_part(v_name, ' ', 1);
      v_r := random();
      v_rating := case
        when v_r < 0.60 then 5
        when v_r < 0.87 then 4
        when v_r < 0.95 then 3
        when v_r < 0.98 then 2
        else 1
      end;
      v_color := case when p.colors is null then null
                      else p.colors[1 + floor(random() * array_length(p.colors, 1))::int] end;
      v_size := case when p.sizes is null then null
                     else p.sizes[1 + floor(random() * array_length(p.sizes, 1))::int] end;
      v_comment := null;
      v_reply := null;

      if v_rating >= 4 then
        if random() < 0.86 then
          select array_agg(c) into v_avail from unnest(v_pool) as c where not (c = any (v_used));
          if v_avail is not null then
            v_comment := v_avail[1 + floor(random() * array_length(v_avail, 1))::int];
            v_used := v_used || v_comment;
            v_comment := replace(replace(v_comment, '{color}', coalesce(lower(v_color), 'ito')), '{size}', coalesce(v_size, 'M'));
          end if;
        end if;
        if v_rating = 5 and random() < 0.10 then
          v_reply := replace(v_thanks[1 + floor(random() * array_length(v_thanks, 1))::int], '{first}', v_first);
        end if;
      else
        if v_rating = 3 then
          v_texts := v_okay; v_topics := v_okay_topic;
        elsif v_rating = 2 then
          v_texts := v_bad2; v_topics := v_bad2_topic;
        else
          v_texts := v_bad1; v_topics := v_bad1_topic;
        end if;
        select array_agg(i) into v_idx
          from generate_subscripts(v_texts, 1) as i
          where not (v_texts[i] = any (v_used));
        if v_idx is null then
          v_k := 1 + floor(random() * array_length(v_texts, 1))::int;
        else
          v_k := v_idx[1 + floor(random() * array_length(v_idx, 1))::int];
        end if;
        v_comment := v_texts[v_k];
        v_topic := v_topics[v_k];
        v_used := v_used || v_comment;
        v_reply := replace(case v_topic
          when 'size' then 'Salamat po sa feedback, {first}! Nag-message na po kami para matulungan kayong magpapalit ng size, libre po ang return.'
          when 'color' then 'Pasensya na po sa abala, {first}. Pinadalhan na po namin kayo ng tamang kulay at mas hinigpitan na namin ang pag-check bago mag-pack.'
          when 'delivery' then 'Pasensya na po sa pagkaantala, {first}. Nakipag-ugnayan na po kami sa courier para hindi na ito maulit.'
          when 'thread' then 'Pasensya na po, {first}! Papalitan po namin ito, at nagdagdag na kami ng quality check bago ipadala.'
          else 'Salamat po sa tapat na review, {first}. Ilalagay na po namin sa listing ang kapal ng tela para malinaw sa lahat.'
        end, '{first}', v_first);
      end if;

      v_created := v_start + random() * (v_end - v_start);
      v_replied := case when v_reply is null then null
                        else least(v_created + (3 + floor(random() * 37))::int * interval '1 hour', v_end) end;

      insert into public.reviews
        (product_id, is_demo, reviewer_display_name, rating, comment, variant_label, created_at, seller_reply, seller_replied_at)
      values
        (p.id, true, v_name, v_rating, v_comment, nullif(concat_ws(' / ', v_color, v_size), ''), v_created, v_reply, v_replied);
    end loop;
  end loop;
end;
$$;

commit;
