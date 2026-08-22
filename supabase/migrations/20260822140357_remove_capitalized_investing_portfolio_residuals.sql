begin;
delete from public.portfolios where mode::text = 'Investing';
commit;
