/* eslint-disable */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AnalysisRouteImport } from './routes/analysis'
import { Route as ChartsRouteImport } from './routes/charts'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const AnalysisRoute = AnalysisRouteImport.update({ id: '/analysis', path: '/analysis', getParentRoute: () => rootRouteImport } as any)
const ChartsRoute = ChartsRouteImport.update({ id: '/charts', path: '/charts', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/analysis': typeof AnalysisRoute
  '/charts': typeof ChartsRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/analysis': typeof AnalysisRoute
  '/charts': typeof ChartsRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/analysis': typeof AnalysisRoute
  '/charts': typeof ChartsRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/analysis' | '/charts'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/analysis' | '/charts'
  id: '__root__' | '/' | '/analysis' | '/charts'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AnalysisRoute: typeof AnalysisRoute
  ChartsRoute: typeof ChartsRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/analysis': { id: '/analysis'; path: '/analysis'; fullPath: '/analysis'; preLoaderRoute: typeof AnalysisRouteImport; parentRoute: typeof rootRouteImport }
    '/charts': { id: '/charts'; path: '/charts'; fullPath: '/charts'; preLoaderRoute: typeof ChartsRouteImport; parentRoute: typeof rootRouteImport }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AnalysisRoute: AnalysisRoute,
  ChartsRoute: ChartsRoute,
}
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
