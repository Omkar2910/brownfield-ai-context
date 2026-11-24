-- Schema export (structure only) for the code-map test.
CREATE TABLE public.customers (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    email character varying(200),
    tier integer,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.orders (
    id bigint PRIMARY KEY,
    customer_id bigint NOT NULL,
    status character varying(20) NOT NULL,
    coupon_id bigint,
    legacy_ref text
);
CREATE TABLE public.order_lines (
    id bigint PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES public.orders(id),
    sku text
);
