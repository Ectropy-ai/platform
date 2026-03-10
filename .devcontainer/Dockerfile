USER root
# Install PostgreSQL client for database testing and automation (Debian-based)
RUN apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean
USER vscode