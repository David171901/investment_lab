-- Invalida el cache de perfiles para que se vuelvan a pedir con los campos
-- nuevos (`name` y `logoUrl`).
--
-- Sin esto, las filas grabadas antes de agregar esas columnas siguen "frescas"
-- durante los 30 días del TTL y nunca se completarían: el logo y el nombre de
-- la empresa quedarían vacíos hasta agosto de 2026 sin ninguna señal de por qué.
--
-- Cuesta una llamada al proveedor por instrumento en cartera, una sola vez.
UPDATE "Instrument" SET "profileFetchedAt" = NULL;
