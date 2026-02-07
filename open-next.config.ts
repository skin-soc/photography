import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  image: {
    deliveryURL: "https://gusmcewan.com",  // Or your custom domain
    variant: "public",  // Matches the variant name you created
  },
});
