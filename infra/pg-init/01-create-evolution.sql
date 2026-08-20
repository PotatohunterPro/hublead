-- Cria o banco evolution (Evolution API) na primeira inicializacao do volume
-- O postgres image executa scripts em /docker-entrypoint-initdb.d apenas no 1o boot
CREATE DATABASE evolution;
