services:
  - type: web
    name: control-plagas-agenda
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    disk:
      name: control-plagas-data
      mountPath: /opt/render/project/src/data
      sizeGB: 1
