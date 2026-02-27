const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [path.resolve(workspaceRoot, 'packages/api')]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.unstable_enableSymlinks = true
config.resolver.extraNodeModules = {
  '@syd/api': path.resolve(workspaceRoot, 'packages/api'),
  // Force singleton packages to resolve from the mobile app's node_modules.
  // packages/api has React 18 in its own node_modules (devDependency), which
  // causes a duplicate React instance crash if Metro picks it up instead.
  'react': path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  '@tanstack/react-query': path.resolve(projectRoot, 'node_modules/@tanstack/react-query'),
  '@supabase/supabase-js': path.resolve(projectRoot, 'node_modules/@supabase/supabase-js'),
}

module.exports = config
