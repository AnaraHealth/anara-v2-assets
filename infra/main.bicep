targetScope = 'resourceGroup'

@description('Globally unique name for the public-site Static Web App.')
@minLength(1)
@maxLength(40)
param staticWebAppName string = 'anara-public-site'

@description('Azure management region for the Static Web App resource.')
@allowed([
  'centralus'
  'eastasia'
  'eastus2'
  'westeurope'
  'westus2'
])
param location string = 'westus2'

@description('Deployment environment tag.')
param environment string = 'production'

var tags = {
  application: 'anara-public-site'
  environment: environment
  managedBy: 'bicep'
  purpose: 'public-static-site'
}

module staticWebApp 'br/public:avm/res/web/static-site:0.9.5' = {
  name: 'deploy-${staticWebAppName}'
  params: {
    name: staticWebAppName
    allowConfigFileUpdates: true
    enableTelemetry: false
    enterpriseGradeCdnStatus: 'Disabled'
    location: location
    publicNetworkAccess: 'Enabled'
    sku: 'Free'
    tags: tags
  }
}

output staticWebAppId string = staticWebApp.outputs.resourceId
output staticWebAppName string = staticWebApp.outputs.name
output defaultHostname string = staticWebApp.outputs.defaultHostname
