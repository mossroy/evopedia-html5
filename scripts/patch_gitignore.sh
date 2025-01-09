#!/bin/bash

# Delete gitignore entry for the dist folder
sed -i "/^\/dist\/$/d" .gitignore

# Replace the /node_modules*/ entry in gitignore with the following
sed -i 's|/node_modules\*/|/node_modules/*\
!/node_modules/@fortawesome\
/node_modules/@fortawesome/*\
!/node_modules/@fortawesome/fontawesome-free\
/node_modules/@fortawesome/fontawesome-free/*\
!/node_modules/@fortawesome/fontawesome-free/js\
/node_modules/@fortawesome/fontawesome-free/js/*\
!/node_modules/@fortawesome/fontawesome-free/js/all.js\
!/node_modules/bootstrap\
/node_modules/bootstrap/*\
!/node_modules/bootstrap/dist\
/node_modules/bootstrap/dist/*\
!/node_modules/bootstrap/dist/css\
/node_modules/bootstrap/dist/css/*\
!/node_modules/bootstrap/dist/css/bootstrap.min.*\
!/node_modules/bootstrap/dist/js\
/node_modules/bootstrap/dist/js/*\
!/node_modules/bootstrap/dist/js/bootstrap.bundle.min.*\
!/node_modules/jquery\
/node_modules/jquery/*\
!/node_modules/jquery/dist\
/node_modules/jquery/dist/*\
!/node_modules/jquery/dist/jquery.slim.min.*\
|' .gitignore
