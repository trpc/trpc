import fs from "fs";

// Modify this is if you want to try bigger routers
// Each router will have 5 procedures + a small sub-router with 2 procedures
const NUM_ROUTERS = 100;

const ROOT_DIR = __dirname + "../";
const MODULES_DIR = __dirname + "/../module";

// delete all folders in MODULES_DIR that start with 'router'
const folders = fs.readdirSync(MODULES_DIR);
for (const folder of folders) {
  if (folder.startsWith("router")) {
    fs.rmSync(MODULES_DIR + "/" + folder, { recursive: true });
  }
}

// read file codege-base.ts in the same dir as this script
const routerBase = fs.readFileSync(
  __dirname + "/router-x/server/codegen-router.ts",
  "utf-8"
);

function createRouter(routerName: string) {
  return routerBase.replace("__ROUTER__NAME__", routerName);
}

const indexBuf: string[] = [];
for (let i = 0; i < NUM_ROUTERS; i++) {
  const routerName = `router${i}`;
  indexBuf.push(routerName);
  const moduleDir = `${MODULES_DIR}/${routerName}`;
  const serverDir = `${moduleDir}/server`;
  fs.mkdirSync(serverDir, {
    recursive: true,
  });
  fs.writeFileSync(`${serverDir}/${routerName}.ts`, createRouter(routerName));

  const tsconfig = {
    extends: "../../tsconfig-base.json",
    compilerOptions: {
      rootDir: ".",
      composite: true,
    },
    references: [
      {
        path: "../trpc-base",
      },
    ],
  };
  fs.writeFileSync(
    `${moduleDir}/tsconfig.json`,
    JSON.stringify(tsconfig, null, 4)
  );
}

{
  // router-app

  const moduleDir = `${MODULES_DIR}/router-app`;
  const serverDir = `${moduleDir}/server`;

  {
    // create index file
    const indexFile = `
    import { router } from '../../trpc-base/server/trpc';

    ${indexBuf
      .map((name) => `import { ${name} } from '../../${name}/server/${name}';`)
      .join("\n")}

    export const appRouter = router({
      ${indexBuf.join(",\n    ")}
    })

    // export only the type definition of the API
    // None of the actual implementation is exposed to the client
    export type AppRouter = typeof appRouter;
    `.trim();

    fs.mkdirSync(serverDir, {
      recursive: true,
    });
    fs.writeFileSync(`${serverDir}/_app.ts`, indexFile);
  }

  {
    // create composite tsconfig for the generated router-app

    const tsconfig = {
      extends: "../../tsconfig-base.json",
      compilerOptions: {
        rootDir: ".",
      },
      references: indexBuf.map((name) => ({
        path: `../${name}`,
      })),
    };

    fs.writeFileSync(
      `${moduleDir}/tsconfig.json`,
      JSON.stringify(tsconfig, null, 4)
    );
  }
}
