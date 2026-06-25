# Control Plagas - Agenda en la nube

Sistema de agenda y asignacion de servicios para tecnicos de control de plagas.

## Inicio

```bash
npm install
npm start
```

## Usuarios iniciales

- Dueno del sistema: `propietario`
- Contrasena del dueno: `dueno123`
- Usuario admin: `admin`
- Contrasena operativa: `admin123`
- Codigo de Compania: `CP`

El propietario puede administrar usuarios.
El usuario admin puede cambiar nombre del sistema, logo, colores, codigo de compania y alertas del supervisor.
Los usuarios normales solo pueden cambiar su propia cuenta.

## Render

Usa:

- Build Command: `npm install`
- Start Command: `npm start`

Para conservar los datos, crea un Persistent Disk con mount path:

```text
/opt/render/project/src/data
```

## Supabase

Para guardar los datos en Supabase:

1. Crea un proyecto en Supabase.
2. En SQL Editor pega y ejecuta el archivo `SUPABASE-SETUP.sql`.
3. En Render, agrega estas variables de entorno:

```text
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

Cuando esas variables existen, el sistema guarda usuarios, configuracion, tecnicos, servicios y reportes en Supabase. Si no existen, usa la carpeta `data` como respaldo local.
