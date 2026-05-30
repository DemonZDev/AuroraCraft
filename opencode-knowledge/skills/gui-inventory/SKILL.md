---
name: gui-inventory
description: Create interactive GUI inventories with click handlers for Minecraft plugins
license: MIT
compatibility: opencode
metadata:
  category: ui
  difficulty: intermediate
---

# GUI Inventory Skill

## What I Do

I help you create interactive chest-based GUI menus with clickable items, pagination, and proper event handling.

## When to Use Me

Use this skill when:
- Creating shop menus
- Building admin panels
- Implementing selection interfaces
- Creating confirmation dialogs
- Building any clickable inventory interface

## Implementation Pattern

### 1. GUIManager Class

```java
package {package}.inventory;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class GUIManager implements Listener {
    private final JavaPlugin plugin;
    private final Map<UUID, InventoryGUI> openGUIs = new HashMap<>();
    
    public GUIManager(JavaPlugin plugin) {
        this.plugin = plugin;
        plugin.getServer().getPluginManager().registerEvents(this, plugin);
    }
    
    public void openGUI(Player player, InventoryGUI gui) {
        openGUIs.put(player.getUniqueId(), gui);
        player.openInventory(gui.getInventory());
    }
    
    public void closeGUI(Player player) {
        openGUIs.remove(player.getUniqueId());
        player.closeInventory();
    }
    
    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player)) return;
        
        Player player = (Player) event.getWhoClicked();
        InventoryGUI gui = openGUIs.get(player.getUniqueId());
        
        if (gui != null) {
            event.setCancelled(true); // Prevent item pickup
            
            if (event.getClickedInventory() == null) return;
            if (!event.getClickedInventory().equals(gui.getInventory())) return;
            
            int slot = event.getSlot();
            gui.handleClick(player, slot, event.getClick());
        }
    }
    
    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (event.getPlayer() instanceof Player) {
            Player player = (Player) event.getPlayer();
            InventoryGUI gui = openGUIs.get(player.getUniqueId());
            
            if (gui != null) {
                gui.onClose(player);
                openGUIs.remove(player.getUniqueId());
            }
        }
    }
    
    public void shutdown() {
        // Close all open GUIs
        for (UUID uuid : new HashMap<>(openGUIs).keySet()) {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null) {
                player.closeInventory();
            }
        }
        openGUIs.clear();
    }
}
```

### 2. InventoryGUI Interface

```java
package {package}.inventory;

import org.bukkit.entity.Player;
import org.bukkit.event.inventory.ClickType;
import org.bukkit.inventory.Inventory;

public interface InventoryGUI {
    Inventory getInventory();
    void handleClick(Player player, int slot, ClickType clickType);
    void onClose(Player player);
}
```

### 3. Example Shop GUI

```java
package {package}.inventory.impl;

import {package}.inventory.InventoryGUI;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.ClickType;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.Arrays;

public class ShopGUI implements InventoryGUI {
    private final Inventory inventory;
    
    public ShopGUI() {
        this.inventory = Bukkit.createInventory(null, 27, Component.text("Shop"));
        setupItems();
    }
    
    private void setupItems() {
        // Add shop items
        inventory.setItem(10, createShopItem(Material.DIAMOND, "Diamond", 100, 
            "Click to buy 1 diamond", "Cost: 100 coins"));
        inventory.setItem(11, createShopItem(Material.EMERALD, "Emerald", 50,
            "Click to buy 1 emerald", "Cost: 50 coins"));
        inventory.setItem(12, createShopItem(Material.GOLD_INGOT, "Gold Ingot", 25,
            "Click to buy 1 gold ingot", "Cost: 25 coins"));
        
        // Add close button
        inventory.setItem(26, createCloseButton());
    }
    
    private ItemStack createShopItem(Material material, String name, int price, String... lore) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(name));
        meta.lore(Arrays.stream(lore).map(Component::text).toList());
        item.setItemMeta(meta);
        return item;
    }
    
    private ItemStack createCloseButton() {
        ItemStack item = new ItemStack(Material.BARRIER);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text("Close"));
        item.setItemMeta(meta);
        return item;
    }
    
    @Override
    public Inventory getInventory() {
        return inventory;
    }
    
    @Override
    public void handleClick(Player player, int slot, ClickType clickType) {
        switch (slot) {
            case 10 -> purchaseItem(player, Material.DIAMOND, 100);
            case 11 -> purchaseItem(player, Material.EMERALD, 50);
            case 12 -> purchaseItem(player, Material.GOLD_INGOT, 25);
            case 26 -> player.closeInventory();
        }
    }
    
    private void purchaseItem(Player player, Material material, int price) {
        // Check balance (integrate with economy system)
        // Deduct price
        // Give item
        player.getInventory().addItem(new ItemStack(material));
        player.sendMessage(Component.text("Purchased " + material.name() + " for " + price + " coins!"));
        player.closeInventory();
    }
    
    @Override
    public void onClose(Player player) {
        // Optional: cleanup or save state
    }
}
```

### 4. Paginated GUI Example

```java
package {package}.inventory.impl;

import {package}.inventory.InventoryGUI;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.ClickType;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.List;

public class PaginatedGUI implements InventoryGUI {
    private final List<ItemStack> items;
    private final int page;
    private final int itemsPerPage = 45; // 5 rows of 9
    private final Inventory inventory;
    
    public PaginatedGUI(List<ItemStack> items, int page) {
        this.items = items;
        this.page = page;
        this.inventory = Bukkit.createInventory(null, 54, 
            Component.text("Items - Page " + (page + 1)));
        setupItems();
    }
    
    private void setupItems() {
        int start = page * itemsPerPage;
        int end = Math.min(start + itemsPerPage, items.size());
        
        // Add items for this page
        for (int i = start; i < end; i++) {
            inventory.setItem(i - start, items.get(i));
        }
        
        // Navigation buttons
        if (page > 0) {
            inventory.setItem(45, createNavButton(Material.ARROW, "Previous Page"));
        }
        if (end < items.size()) {
            inventory.setItem(53, createNavButton(Material.ARROW, "Next Page"));
        }
        
        // Close button
        inventory.setItem(49, createCloseButton());
    }
    
    private ItemStack createNavButton(Material material, String name) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(name));
        item.setItemMeta(meta);
        return item;
    }
    
    private ItemStack createCloseButton() {
        ItemStack item = new ItemStack(Material.BARRIER);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text("Close"));
        item.setItemMeta(meta);
        return item;
    }
    
    @Override
    public Inventory getInventory() {
        return inventory;
    }
    
    @Override
    public void handleClick(Player player, int slot, ClickType clickType) {
        if (slot == 45 && page > 0) {
            // Previous page
            new PaginatedGUI(items, page - 1);
            // Re-open via GUIManager
        } else if (slot == 53 && (page + 1) * itemsPerPage < items.size()) {
            // Next page
            new PaginatedGUI(items, page + 1);
            // Re-open via GUIManager
        } else if (slot == 49) {
            player.closeInventory();
        } else if (slot < itemsPerPage) {
            // Handle item click
            ItemStack clicked = inventory.getItem(slot);
            if (clicked != null) {
                player.sendMessage(Component.text("You clicked: " + clicked.getType()));
            }
        }
    }
    
    @Override
    public void onClose(Player player) {
        // Cleanup
    }
}
```

## Usage Example

```java
// In main plugin class
private GUIManager guiManager;

@Override
public void onEnable() {
    guiManager = new GUIManager(this);
}

@Override
public void onDisable() {
    guiManager.shutdown();
}

// In command
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (sender instanceof Player player) {
        ShopGUI gui = new ShopGUI();
        guiManager.openGUI(player, gui);
        return true;
    }
    return false;
}
```

## Critical Rules

1. **ALWAYS** cancel InventoryClickEvent to prevent item pickup
2. **ALWAYS** check if clicked inventory matches GUI inventory
3. **ALWAYS** track open GUIs per player
4. **ALWAYS** clean up on inventory close
5. **NEVER** modify player inventory from async thread
6. **ALWAYS** use Component for item names (Paper 1.21.4)

## Common Mistakes to Avoid

- ❌ Not cancelling click events (items get picked up)
- ❌ Not checking which inventory was clicked (affects player inventory too)
- ❌ Memory leaks from not removing closed GUIs
- ❌ Using legacy String for item names instead of Component
- ❌ Not handling edge cases (null items, out of bounds)
