import axios from 'axios';
import type {
  MinecraftVersion,
  VersionInfo,
  Server,
} from '../../shared/types.js';

export class VersionResolver {
  private static readonly MOJANG_API =
    'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  private static readonly PAPER_API = 'https://api.papermc.io/v2';
  private static readonly FABRIC_API = 'https://meta.fabricmc.net/v2';
  private static readonly SPIGOT_API = 'https://hub.spigotmc.org/versions';

  private static versionCache: Map<string, VersionInfo> = new Map();
  private static cacheExpiry: Map<string, number> = new Map();
  private static readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  // Get all available versions for a server type
  static async getVersions(type: Server['type']): Promise<VersionInfo> {
    const cacheKey = `versions_${type}`;
    const now = Date.now();

    // Check cache
    if (
      this.versionCache.has(cacheKey) &&
      this.cacheExpiry.has(cacheKey) &&
      this.cacheExpiry.get(cacheKey)! > now
    ) {
      return this.versionCache.get(cacheKey)!;
    }

    let versionInfo: VersionInfo;

    try {
      switch (type) {
        case 'paper':
          versionInfo = await this.getPaperVersions();
          break;
        case 'fabric':
          versionInfo = await this.getFabricVersions();
          break;
        case 'spigot':
          versionInfo = await this.getSpigotVersions();
          break;
        case 'bukkit':
          versionInfo = await this.getBukkitVersions();
          break;
        default:
          versionInfo = await this.getPaperVersions(); // Default to Paper
      }

      // Cache the result
      this.versionCache.set(cacheKey, versionInfo);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

      return versionInfo;
    } catch (error) {
      console.error(`Error fetching versions for ${type}:`, error);

      // Return cached version if available, otherwise return fallback
      if (this.versionCache.has(cacheKey)) {
        return this.versionCache.get(cacheKey)!;
      }

      return this.getFallbackVersions(type);
    }
  }

  // Get latest version for a server type
  static async getLatestVersion(
    type: Server['type']
  ): Promise<MinecraftVersion> {
    const versions = await this.getVersions(type);
    return versions.latest;
  }

  // Get recommended version for a server type
  static async getRecommendedVersion(
    type: Server['type']
  ): Promise<MinecraftVersion> {
    const versions = await this.getVersions(type);
    return versions.recommended;
  }

  // Resolve version string to actual version info
  static async resolveVersion(
    type: Server['type'],
    versionString: string
  ): Promise<MinecraftVersion> {
    if (versionString === 'latest') {
      return this.getLatestVersion(type);
    }

    if (versionString === 'recommended') {
      return this.getRecommendedVersion(type);
    }

    const versions = await this.getVersions(type);
    const version = versions.versions.find(v => v.version === versionString);

    if (!version) {
      console.warn(
        `Version ${versionString} not found for ${type}, using latest`
      );
      return versions.latest;
    }

    return version;
  }

  // Get Paper versions
  private static async getPaperVersions(): Promise<VersionInfo> {
    const response = await axios.get(`${this.PAPER_API}/projects/paper`);
    const projectData = response.data;

    const versions: MinecraftVersion[] = projectData.versions.map(
      (version: string) => ({
        version,
        type: 'paper' as const,
        url: `${this.PAPER_API}/projects/paper/versions/${version}`,
        stable: true,
        latest: false,
      })
    );

    // Reverse to show latest versions first
    versions.reverse();

    // Mark latest version (now first in array)
    if (versions.length > 0) {
      versions[0].latest = true;
    }

    const latest = versions[0];
    const recommended = versions.find(v => v.stable) || latest;

    return { versions, latest, recommended };
  }

  // Get Fabric versions
  private static async getFabricVersions(): Promise<VersionInfo> {
    const [gameVersions, loaderVersions] = await Promise.all([
      axios.get(`${this.FABRIC_API}/versions/game`),
      axios.get(`${this.FABRIC_API}/versions/loader`),
    ]);

    const stableGameVersions = gameVersions.data.filter((v: any) => v.stable);
    const latestLoader = loaderVersions.data[0];

    const versions: MinecraftVersion[] = stableGameVersions.map(
      (gameVersion: any) => ({
        version: gameVersion.version,
        type: 'fabric' as const,
        build_id: latestLoader.version,
        url: `${this.FABRIC_API}/versions/loader/${gameVersion.version}/${latestLoader.version}/server/jar`,
        stable: gameVersion.stable,
        latest: false,
      })
    );

    // Mark latest version
    if (versions.length > 0) {
      versions[0].latest = true;
    }

    const latest = versions[0];
    const recommended = versions.find(v => v.stable) || latest;

    return { versions, latest, recommended };
  }

  // Get Spigot versions (using Mojang API as base)
  private static async getSpigotVersions(): Promise<VersionInfo> {
    const response = await axios.get(this.MOJANG_API);
    const manifest = response.data;

    // Filter to release versions only
    const releaseVersions = manifest.versions.filter(
      (v: any) => v.type === 'release'
    );

    const versions: MinecraftVersion[] = releaseVersions.map(
      (version: any) => ({
        version: version.id,
        type: 'spigot' as const,
        url: `https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar`,
        stable: true,
        latest: false,
      })
    );

    // Mark latest version
    if (versions.length > 0) {
      versions[0].latest = true;
    }

    const latest = versions[0];
    const recommended = versions.find(v => v.stable) || latest;

    return { versions, latest, recommended };
  }

  // Get Bukkit versions (same as Spigot for now)
  private static async getBukkitVersions(): Promise<VersionInfo> {
    return this.getSpigotVersions();
  }

  // Fallback versions when API calls fail
  private static getFallbackVersions(type: Server['type']): VersionInfo {
    const commonVersions = [
      '1.20.4',
      '1.20.3',
      '1.20.2',
      '1.20.1',
      '1.20',
      '1.19.4',
      '1.19.3',
      '1.19.2',
      '1.19.1',
      '1.19',
      '1.18.2',
      '1.18.1',
      '1.18',
      '1.17.1',
      '1.17',
      '1.16.5',
      '1.16.4',
    ];

    const versions: MinecraftVersion[] = commonVersions.map(
      (version, index) => ({
        version,
        type,
        url: '',
        stable: true,
        latest: index === 0,
      })
    );

    const latest = versions[0];
    const recommended = versions[0];

    return { versions, latest, recommended };
  }

  // Clear version cache
  static clearCache(): void {
    this.versionCache.clear();
    this.cacheExpiry.clear();
  }

  // Get cache status
  static getCacheStatus(): {
    [key: string]: { cached: boolean; expiresAt?: number };
  } {
    const status: { [key: string]: { cached: boolean; expiresAt?: number } } =
      {};
    const now = Date.now();

    const types: Server['type'][] = ['paper', 'fabric', 'spigot', 'bukkit'];

    types.forEach(type => {
      const cacheKey = `versions_${type}`;
      const cached = this.versionCache.has(cacheKey);
      const expiresAt = this.cacheExpiry.get(cacheKey);

      status[type] = {
        cached: cached && expiresAt ? expiresAt > now : false,
        expiresAt,
      };
    });

    return status;
  }
}
