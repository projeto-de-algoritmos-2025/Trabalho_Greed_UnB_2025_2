"""
Huffman Coding Implementation using Chained Lists
"""

class Node:
    """Node for Huffman Tree"""
    def __init__(self, char=None, freq=0, left=None, right=None):
        self.char = char
        self.freq = freq
        self.left = left
        self.right = right

    def is_leaf(self):
        return self.left is None and self.right is None

    def to_dict(self):
        """Convert node to dictionary for JSON serialization"""
        result = {
            'freq': self.freq,
            'char': self.char
        }
        if self.left:
            result['left'] = self.left.to_dict()
        if self.right:
            result['right'] = self.right.to_dict()
        return result


class ChainedListNode:
    """Node for chained list (linked list) to avoid array overflow"""
    def __init__(self, tree_node):
        self.tree_node = tree_node
        self.next = None


class ChainedList:
    """Chained list for storing nodes sorted by frequency"""
    def __init__(self):
        self.head = None
        self.size = 0

    def insert_sorted(self, tree_node):
        """Insert node in sorted order (ascending by frequency)"""
        new_node = ChainedListNode(tree_node)
        self.size += 1

        # Empty list or insert at beginning
        if self.head is None or self.head.tree_node.freq >= tree_node.freq:
            new_node.next = self.head
            self.head = new_node
            return

        # Find position to insert
        current = self.head
        while current.next and current.next.tree_node.freq < tree_node.freq:
            current = current.next

        new_node.next = current.next
        current.next = new_node

    def remove_first(self):
        """Remove and return the first tree node (lowest frequency)"""
        if self.head is None:
            return None

        tree_node = self.head.tree_node
        self.head = self.head.next
        self.size -= 1
        return tree_node

    def is_empty(self):
        return self.head is None

    def get_size(self):
        return self.size


class HuffmanCoding:
    """Huffman Coding implementation"""

    def __init__(self):
        self.root = None
        self.codes = {}
        self.reverse_codes = {}

    def calculate_frequency(self, text):
        """Calculate character frequencies"""
        freq_dict = {}
        for char in text:
            freq_dict[char] = freq_dict.get(char, 0) + 1
        return freq_dict

    def build_tree(self, text):
        """Build Huffman tree from text"""
        # Calculate frequencies
        freq_dict = self.calculate_frequency(text)

        if not freq_dict:
            return None

        # Create chained list with initial nodes (one for each character)
        chained_list = ChainedList()
        for char, freq in freq_dict.items():
            node = Node(char=char, freq=freq)
            chained_list.insert_sorted(node)

        # Build tree by merging nodes
        while chained_list.get_size() > 1:
            # Remove two nodes with lowest frequency
            left = chained_list.remove_first()
            right = chained_list.remove_first()

            # Create new internal node with combined frequency
            merged = Node(
                char=None,
                freq=left.freq + right.freq,
                left=left,
                right=right
            )

            # Insert merged node back into list
            chained_list.insert_sorted(merged)

        # Root is the last remaining node
        self.root = chained_list.remove_first()

        # Generate codes
        self._generate_codes()

        return self.root

    def _generate_codes_recursive(self, node, current_code):
        """Recursively generate codes by traversing tree"""
        if node is None:
            return

        # Leaf node - store the code
        if node.is_leaf():
            # Reverse the code (as per requirement: pile and unpile)
            self.codes[node.char] = current_code if current_code else '0'
            self.reverse_codes[current_code if current_code else '0'] = node.char
            return

        # Traverse left (add '0')
        self._generate_codes_recursive(node.left, current_code + '0')

        # Traverse right (add '1')
        self._generate_codes_recursive(node.right, current_code + '1')

    def _generate_codes(self):
        """Generate Huffman codes for all characters"""
        self.codes = {}
        self.reverse_codes = {}
        if self.root:
            self._generate_codes_recursive(self.root, '')

    def encode(self, text):
        """Encode text using Huffman codes"""
        if not self.codes:
            return ''

        encoded = ''.join(self.codes.get(char, '') for char in text)
        return encoded

    def decode(self, encoded_text):
        """Decode encoded text using Huffman tree"""
        if not self.root:
            return ''

        decoded = []
        current = self.root

        for bit in encoded_text:
            # Traverse tree based on bit
            if bit == '0':
                current = current.left
            else:
                current = current.right

            # If leaf node, we found a character
            if current.is_leaf():
                decoded.append(current.char)
                current = self.root  # Reset to root for next character

        return ''.join(decoded)

    def get_codes_table(self):
        """Get the codes table for display"""
        return self.codes

    def get_tree_structure(self):
        """Get tree structure for visualization"""
        if self.root:
            return self.root.to_dict()
        return None
