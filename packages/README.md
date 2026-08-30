# Shared packages

Tempat untuk contract/type yang benar-benar dipakai bersama `app/web` dan `app/server`.

Jangan menyalin domain logic di dua aplikasi. Saat API client dan integration tests
dipindahkan dari demo ke production, contract publik dapat diekstrak ke package
workspace terpisah di folder ini.
