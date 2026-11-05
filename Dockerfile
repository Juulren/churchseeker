# One image with the web app and the API (one origin: same cookies, no CORS). Built from the repository root:
#   docker build -t churchseeker .
# Vercel's container preset uses this file; it also runs on any host that runs containers.

FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY Backend/ChurchSeeker.sln Backend/
COPY Backend/src/ Backend/src/
RUN dotnet publish Backend/src/ChurchSeeker.WebAPI -c Release -o /out --no-self-contained -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS run
# QuestPDF (Skia) needs fontconfig and a font with Spanish accents.
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /out ./
COPY --from=web /web/dist ./wwwroot
ENV HOME=/tmp \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_gcServer=0 \
    ASPNETCORE_ENVIRONMENT=Production \
    PORT=8080 \
    ForwardedHeaders__Enabled=true \
    Storage__Provider=Database \
    Database__Provider=Postgres
# The host decides the port (Vercel sets PORT); listen on all interfaces.
ENTRYPOINT ["sh", "-c", "export ASPNETCORE_URLS=http://0.0.0.0:${PORT} && exec dotnet ChurchSeeker.WebAPI.dll"]
USER app
EXPOSE 8080
