/**
 * B-Tree implementation for indexing
 */
export class BTree {
    constructor(options = {}) {
        this.degree = options.degree || 3; // Minimum degree
        this.storageEngine = options.storageEngine;
        this.fileId = options.fileId;
        this.keyCompare = options.keyCompare || this.defaultCompare;
        
        this.rootPageId = null;
        this.height = 0;
        this.size = 0;
    }

    defaultCompare(a, b) {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    async initialize() {
        // Create root node
        const rootPage = await this.storageEngine.allocatePage(this.fileId);
        this.rootPageId = rootPage.pageId;
        
        const rootNode = new BTreeNode(true, this.degree);
        await this.writeNode(rootPage, rootNode);
        
        this.height = 1;
    }

    async insert(key, value) {
        const rootPage = await this.storageEngine.readPage(this.fileId, this.rootPageId);
        const rootNode = await this.readNode(rootPage);

        if (rootNode.isFull()) {
            // Create new root
            const newRootPage = await this.storageEngine.allocatePage(this.fileId);
            const newRoot = new BTreeNode(false, this.degree);
            
            newRoot.children[0] = this.rootPageId;
            this.rootPageId = newRootPage.pageId;
            
            await this.splitChild(newRoot, 0, rootNode);
            await this.writeNode(newRootPage, newRoot);
            
            this.height++;
        }

        await this.insertNonFull(this.rootPageId, key, value);
        this.size++;
    }

    async insertNonFull(pageId, key, value) {
        const page = await this.storageEngine.readPage(this.fileId, pageId);
        const node = await this.readNode(page);

        let i = node.keys.length - 1;

        if (node.isLeaf) {
            // Insert in leaf
            node.keys.push(null);
            node.values.push(null);

            while (i >= 0 && this.keyCompare(key, node.keys[i]) < 0) {
                node.keys[i + 1] = node.keys[i];
                node.values[i + 1] = node.values[i];
                i--;
            }

            node.keys[i + 1] = key;
            node.values[i + 1] = value;
            await this.writeNode(page, node);
        } else {
            // Find child to recurse to
            while (i >= 0 && this.keyCompare(key, node.keys[i]) < 0) {
                i--;
            }
            i++;

            const childPageId = node.children[i];
            const childPage = await this.storageEngine.readPage(this.fileId, childPageId);
            const childNode = await this.readNode(childPage);

            if (childNode.isFull()) {
                await this.splitChild(node, i, childNode);
                await this.writeNode(page, node);

                if (this.keyCompare(key, node.keys[i]) > 0) {
                    i++;
                }
            }

            await this.insertNonFull(node.children[i], key, value);
        }
    }

    async splitChild(parentNode, index, fullChild) {
        const degree = this.degree;
        const newChildPage = await this.storageEngine.allocatePage(this.fileId);
        const newChild = new BTreeNode(fullChild.isLeaf, degree);

        // Move half of the keys to new child
        for (let j = 0; j < degree - 1; j++) {
            newChild.keys[j] = fullChild.keys[j + degree];
            newChild.values[j] = fullChild.values[j + degree];
        }

        if (!fullChild.isLeaf) {
            for (let j = 0; j < degree; j++) {
                newChild.children[j] = fullChild.children[j + degree];
            }
        }

        // Reduce size of original child
        fullChild.keys.length = degree - 1;
        fullChild.values.length = degree - 1;
        if (!fullChild.isLeaf) {
            fullChild.children.length = degree;
        }

        // Move parent's children and keys
        for (let j = parentNode.children.length; j >= index + 2; j--) {
            parentNode.children[j] = parentNode.children[j - 1];
        }
        parentNode.children[index + 1] = newChildPage.pageId;

        for (let j = parentNode.keys.length - 1; j >= index; j--) {
            parentNode.keys[j + 1] = parentNode.keys[j];
            parentNode.values[j + 1] = parentNode.values[j];
        }

        parentNode.keys[index] = fullChild.keys[degree - 1];
        parentNode.values[index] = fullChild.values[degree - 1];

        await this.writeNode(newChildPage, newChild);
    }

    async search(key) {
        if (this.rootPageId === null) {
            return null;
        }

        return await this.searchNode(this.rootPageId, key);
    }

    async searchNode(pageId, key) {
        const page = await this.storageEngine.readPage(this.fileId, pageId);
        const node = await this.readNode(page);

        let i = 0;
        while (i < node.keys.length && this.keyCompare(key, node.keys[i]) > 0) {
            i++;
        }

        if (i < node.keys.length && this.keyCompare(key, node.keys[i]) === 0) {
            return node.values[i];
        }

        if (node.isLeaf) {
            return null;
        }

        return await this.searchNode(node.children[i], key);
    }

    async delete(key) {
        if (this.rootPageId === null) {
            return false;
        }

        const deleted = await this.deleteFromNode(this.rootPageId, key);
        if (deleted) {
            this.size--;
        }
        return deleted;
    }

    async deleteFromNode(pageId, key) {
        const page = await this.storageEngine.readPage(this.fileId, pageId);
        const node = await this.readNode(page);

        let i = 0;
        while (i < node.keys.length && this.keyCompare(key, node.keys[i]) > 0) {
            i++;
        }

        if (i < node.keys.length && this.keyCompare(key, node.keys[i]) === 0) {
            // Key found in this node
            if (node.isLeaf) {
                // Remove from leaf
                node.keys.splice(i, 1);
                node.values.splice(i, 1);
                await this.writeNode(page, node);
                return true;
            } else {
                // Handle internal node deletion (simplified)
                // In practice, you'd need to handle borrowing and merging
                throw new Error('Internal node deletion not implemented');
            }
        } else if (!node.isLeaf) {
            // Recurse to child
            return await this.deleteFromNode(node.children[i], key);
        }

        return false;
    }

    async readNode(page) {
        const data = page.getData();
        return BTreeNode.deserialize(data, this.degree);
    }

    async writeNode(page, node) {
        const data = node.serialize();
        page.setData(data);
    }

    getStats() {
        return {
            size: this.size,
            height: this.height,
            degree: this.degree
        };
    }
}

/**
 * B-Tree Node
 */
class BTreeNode {
    constructor(isLeaf, degree) {
        this.isLeaf = isLeaf;
        this.degree = degree;
        this.keys = [];
        this.values = [];
        this.children = [];
    }

    isFull() {
        return this.keys.length >= 2 * this.degree - 1;
    }

    serialize() {
        const data = {
            isLeaf: this.isLeaf,
            degree: this.degree,
            keys: this.keys,
            values: this.values,
            children: this.children
        };
        
        return Buffer.from(JSON.stringify(data));
    }

    static deserialize(buffer, degree) {
        try {
            const data = JSON.parse(buffer.toString());
            const node = new BTreeNode(data.isLeaf, degree);
            
            node.keys = data.keys || [];
            node.values = data.values || [];
            node.children = data.children || [];
            
            return node;
        } catch (error) {
            // Return empty node if deserialization fails
            console.warn('Failed to deserialize B-Tree node:', error.message);
            return new BTreeNode(true, degree);
        }
    }
}
