alter table public.plans drop constraint plans_mode_check;
alter table public.plans add constraint plans_mode_check check (mode in ('trading','forex','crypto'));
alter table public.portfolio_items drop constraint portfolio_items_mode_check;
alter table public.portfolio_items add constraint portfolio_items_mode_check check (mode in ('trading','forex','crypto'));
