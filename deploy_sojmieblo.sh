#!/bin/bash

# Update package lists
sudo apt update

# Install Node.js
sudo apt install -y nodejs npm git

# Clone the GitHub repository
git clone https://github.com/username/repository.git
cd repository

# Modify server.js for port 777 and localhost binding
sed -i 's/const PORT = 3000/const PORT = 777/' server.js
sed -i 's/const HOST = "0.0.0.0"/const HOST = "localhost"/' server.js

# Install npm dependencies
npm install

# Create systemd service for autostart
cat <<EOT | sudo tee /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js App

[Service]
ExecStart=/usr/bin/node /path/to/repository/server.js
Restart=always
User=ubuntu
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOT

# Start the service
sudo systemctl start myapp
sudo systemctl enable myapp

# Configure Nginx proxy with user prompt for config path
read -p 'Enter Nginx config path: ' config_path
sudo cp /etc/nginx/sites-available/default $config_path
sudo systemctl restart nginx

# Set up firewall rules
sudo ufw allow 777

# Provide installation instructions
echo "Installation completed successfully! Your application should now be running on http://localhost:777"